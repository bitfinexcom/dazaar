const hypercore = require('hypercore')
const pump = require('pump')
const market = require('../market')

const m1 = market('./tmp-seller')
const m2 = market('./tmp-buyer-1')
const m3 = market('./tmp-buyer-2')

const feed = hypercore('./tmp-feed')

feed.append('valuable')

const seller = m1.sell(feed, {
  validate (remoteKey, cb) {
    cb(null) // free!
  }
})

seller.receive('test', function (message, from) {
  console.log('test message from', from.remotePublicKey)
  seller.send('test', { echo: message }, from)
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling
  console.log('seller key pair fully loaded ...')

  const buyer1 = m2.buy(seller.key)
  const buyer2 = m3.buy(seller.key)

  buyer1.on('peer-add', function () {
    console.log('connected to ' + buyer1.peers.length + ' peer(s)')
    buyer1.broadcast('test', 'peer-add')
  })

  buyer1.receive('test', function (message) {
    console.log('buyer 1 got test message', message)
  })

  buyer2.receive('test', function (message) {
    console.log('buyer 2 got test message', message)
  })

  buyer1.once('validate', function () {
    // broadcast hits all connected sellers
    buyer1.broadcast('test', 'hello seller from buyer 1')
  })

  buyer2.once('validate', function () {
    // broadcast hits all connected sellers
    buyer2.broadcast('test', 'hello seller from buyer 2')
  })

  const stream1 = seller.replicate()
  pump(stream1, buyer1.replicate(), stream1)

  const stream2 = seller.replicate()
  pump(stream2, buyer2.replicate(), stream2)
})
