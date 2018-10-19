'use strict'

const hypercore = require('hypercore')
const pump = require('pump')
const market = require('../market')
const network = require('@hyperswarm/network')

const m = market('./tmp')
const feed = hypercore('./tmp/data-to-sell')

// simulate https://github.com/bitfinexcom/bfx-hf-indicators
const rsi = () => {
  const data = [ 12, 10, 16, 22 ]
  const ri = Math.floor(Math.random() * data.length)
  return JSON.stringify([ Date.now(), data[ri] ])
}

setInterval(() => {
  feed.append(rsi())
}, 1000 * 5)

let valid = true
const offer = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore', remoteKey)

    if (!valid) {
      return cb(new Error('session expired'))
    }

    cb(null)
  }
})

const net = network()
offer.on('ready', function () {
  const disKey = offer.key
  console.log('seller key pair fully loaded ...')
  console.log('our discovery key:', disKey.toString('hex'))
  console.log('run:')
  console.log('node examples/buyer.js', disKey.toString('hex'))

  net.join(disKey, {
    lookup: false, // find & connect to peers
    announce: true // optional- announce self as a connection target
  })

  net.on('connection', (buyer, details) => {
    console.log('new connection!', details)
    const stream = offer.replicate()

    pump(stream, buyer, stream, function (err) {
      console.log('replication ended', err)
    })
  })
})
