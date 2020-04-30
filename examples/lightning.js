const Payment = require('../../dazaar-payment')
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('../market')

const lndOpts = {
  lnddir: '.lnd-dir',
  rpcPort: 'localhost:11009',
  address: 'localhost:9731',
  network: 'regtest',
  implementation: 'lnd'
}

const cOpts = {
  lightningdDir: 'c-lightning-dir',
  address: 'localhost:9733',
  network: 'regtest',
  implementation: 'c-lightning'
}

const paymentCard = {
  payto: 'dazaartest22',
  currency: 'LightningSats',
  amount: '200',
  unit: 'seconds',
  interval: 1
}

const m = market('./tmp')

const feed = hypercore('./tmp/data1')

let sellerLnd
let buyerLnd

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore: ', remoteKey)
    sellerLnd.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling

  const buyer = m.buy(seller.key)

  sellerLnd = new Payment(seller, [paymentCard], cOpts)
  buyerLnd = new Payment(buyer, [paymentCard], lndOpts)

  buyer.on('validate', function () {
    console.log('remote validated us')
  })

  buyer.on('feed', function () {
    console.log('got feed!')

    buyer.feed.createReadStream({ live: true })
      .on('data', console.log)
  })

  const stream = seller.replicate()

  pump(stream, buyer.replicate(), stream, function (err) {
    console.log('replication ended', err)
  })

  // buying flow
  buyerLnd.buy(null, 2000, null, function (err) {
    if (err) console.error(err)
    sellerLnd.validate(buyer.key, function (err, info) {
      if (err) console.error(err)
      console.log(info.type + 'remaining:' + info.remaining)
    })
  })
})
