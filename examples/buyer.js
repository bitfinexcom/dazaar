'use strict'

const hypercore = require('hypercore')
const network = require('@hyperswarm/network')
const market = require('../market')
const pump = require('pump')

const m = market('./tmp-2')

const KEY = process.argv[2]
console.log('connecting to', KEY)
const bKey = Buffer.from(KEY, 'hex')

const net = network()
const buyer = m.buy(bKey)

buyer.on('ready', go)

buyer.on('feed', (feed) => {
  console.log('feed!', feed)
})

buyer.on('validate', () => {
  console.log('remote validated us')
})

function go () {
  net.join(bKey, {
    lookup: true, // find & connect to peers
    announce: false // optional- announce self as a connection target
  })

  net.on('connection', (socket, details) => {
    console.log(details)
    pump(socket, buyer.replicate(), process.stdout, (err) => {
      console.log('replication ended', err)
    })
  })
}
