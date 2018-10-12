const hypercore = require('hypercore')
const pump = require('pump')
const market = require('./market')

const m = market('./tmp')

const feed = hypercore('./tmp/data')

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore', remoteKey)
    cb(null)
  }
})

seller.on('ready', function () {
  console.log('seller key pair fully loaded ...')

  const buyer = m.buy(seller.key)

  buyer.on('feed', function () {
    console.log('got the feed!')
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
})
