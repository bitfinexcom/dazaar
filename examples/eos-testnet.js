const dazaar = require('../')
const hypercore = require('hypercore')
const Payment = require('@dazaar/payment')
const swarm = require('dazaar/swarm')

const feed = hypercore('eos-dazaar/some-data-we-are-selling')

setInterval(function () {
  feed.append('hello! ' + new Date() + '\n')
}, 1000)

const market = dazaar('eos-dazaar')
let payment = null

const seller = market.sell(feed, {
  validate (remoteKey, done) {
    payment.validate(remoteKey, function (err, info) {
      console.log('Validated', remoteKey, err, info)
      done(err, info)
    })
  }
})

seller.ready(function () {
  const card = {
    id: seller.key.toString('hex'),
    payment: [
      { payTo: 'dazaartest22', currency: 'EOS', amount: '0.0001', unit: 'seconds', interval: 1 }
    ]
  }

  payment = new Payment(seller, card.payment)

  console.log('Selling! Dazaar card:')
  console.log(JSON.stringify(card, null, 2))

  swarm(seller)
})
