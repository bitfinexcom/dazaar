const test = require('tape')
const hypercore = require('hypercore')
const Payment = require('@dazaar/payment')
const dazaar = require('../')
const pump = require('pump')

var eosOpts = { sell: {}, buy: {} }

eosOpts.sell.account = 'bob'
eosOpts.sell.privateKey = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3'
eosOpts.sell.chainId = 'cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f'
eosOpts.sell.rpc = 'http://localhost:8888'

eosOpts.buy.privateKey = '5KDiuujiPNpTEZ1zJ3NNCHDMq8C3SeAmHMbhxv5MGkphTYAHy7s'
eosOpts.buy.account = 'alice'
eosOpts.buy.rpc = 'http://localhost:8888'
eosOpts.buy.chainId = 'cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f'

var lnOpts = { lnd: {}, c: {} }

lnOpts.lnd.lnddir = '../../lightning/.lnd'
lnOpts.lnd.rpcPort = 'localhost:11009'
lnOpts.lnd.address = 'localhost:9731'
lnOpts.lnd.network = 'regtest'
lnOpts.lnd.implementation = 'lnd'

lnOpts.c.lightningdDir = '../../lightning/.c'
lnOpts.c.address = 'localhost:9733'
lnOpts.c.network = 'regtest'
lnOpts.c.implementation = 'c-lightning'

const sellCard = {
  payment: [
    // { payTo: 'bob', currency: 'EOS', amount: '0.0001', unit: 'seconds', interval: 1, label: 'eos' },
    { currency: 'LightningSats', amount: '200', unit: 'seconds', interval: 1, label: 'lnd' }
  ]
}

const buyCard = {
  payment: [
    { payTo: 'bob', currency: 'EOS', amount: '0.0001', unit: 'seconds', interval: 1, label: 'eos' },
    { currency: 'LightningSats', amount: '200', unit: 'seconds', interval: 1, label: 'clightning' }
  ]
}

let receiver
let payer
let buyer
const expected = []

const feed = hypercore('./tmp/data1')

setInterval(function () {
  var expect = 'hello! ' + new Date() + '\n'
  feed.append(expect)
  expected.push(expect)
}, 1000)

const market = dazaar('dazaar-test')

const seller = market.sell(feed, {
  validate (remoteKey, done) {
    receiver.validate(remoteKey, function (err, info) {
      // console.log('validated', remoteKey, err, info)
      done(err, info)
    })
  }
})

seller.ready(function (err) {
  if (err) console.error(err)

  buyer = market.buy(seller.key)

  sellCard.id = seller.key.toString('hex')
  buyCard.id = buyer.key.toString('hex')

  var sellOpts = {
    eos: eosOpts.sell,
    lnd: lnOpts.lnd
  }

  var buyOpts = {
    eos: eosOpts.buy,
    clightning: lnOpts.c
  }

  receiver = new Payment(seller, sellCard.payment, sellOpts)
  payer = new Payment(buyer, buyCard.payment, buyOpts)

  buyer.on('validate', function () {
    console.log('remote validated us')
  })

  buyer.on('feed', function () {
    console.log('got feed')

    buyer.feed.createReadStream({ live: true })
      .on('data', testFeed)
  })

  const str = seller.replicate()
  const buyFeed = buyer.replicate()

  pump(str, buyFeed, str, function (err) {
    console.log('replication ended', err)
  })

  // amount of time desired
  const time = 5
  const options = payer.value(sellCard, time)
  const chosen = options[0]

  payer.buy(sellCard, chosen.amount, chosen.provider, buyOpts.eos, () => { setTimeout(testPayment(time), 2000) })
})

function testPayment (expiry) {
  return () => test(`test ${expiry} second payment`, t => {
    console.log('ok')
    receiver.validate(buyer.key, function (err, info) {
      if (err) console.error(err)
      else {
        t.equal(err, null)
        t.ok(info.remaining <= expiry * 1000)
        t.ok(info.remaining > 0)

        setTimeout(() => receiver.validate(buyer.key, function (err, info) {
          t.assert(err && err.message === 'No time left on subscription')
          t.end()
        }), expiry * 1000 + 5000)
      }
    })
  })
}

function testFeed (data) {
  return test('test feed content', t => {
    t.equal(data.toString(), expected.splice(0, 1).pop())
    return t.end()
  })
}
