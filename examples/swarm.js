const hypercore = require('hypercore')
const swarm = require('../swarm')
const market = require('../market')

const m = market('./tmp')
const feed = hypercore('./tmp/data')

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore', remoteKey)
    cb(null)
  }
})

swarm(seller)

seller.ready(function (err) {
  if (err) throw err

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

  buyer.on('invalidate', function (err) {
    console.log('remote invalidated us', err)
  })

  swarm(buyer)
})
