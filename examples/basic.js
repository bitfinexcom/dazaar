const hypercore = require('hypercore')
const pump = require('pump')
const market = require('../market')

const m = market('./tmp-seller', {
  masterKey: Buffer.from('16bc1bcba660dfa4c0104bda285543225b83152eb096c011bb4f47c076730078', 'hex')
})
const m2 = market('./tmp-buyer')

m.ready(function () {
  console.log('master key', m.masterKey.toString('hex'))
})

const feed = hypercore('./tmp-feed')

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore', remoteKey)
    cb(null)
  }
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling
  console.log('seller key pair fully loaded ...')

  const buyer = m2.buy(seller.key)

  buyer.on('feed', function () {
    console.log('got the feed!', buyer.feed.key.toString('hex'))
    buyer.feed.get(0, function (err, data) {
      if (err) throw err
      console.log('first feed entry: ' + data)
    })
  })

  buyer.on('validate', function () {
    console.log('remote validated us')
  })

  const stream = seller.replicate()

  pump(stream, buyer.replicate(), stream, function (err) {
    console.log('replication ended', err)
  })

  process.on('SIGINT', function () {
    console.log('destroying instances ...')
    buyer.destroy()
    seller.destroy()
    m.destroy()
    m2.destroy()
  })
})
