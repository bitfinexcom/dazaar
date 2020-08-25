'use strict'

const dazaar = require('../')
const hypercore = require('hypercore')
const Payment = require('@dazaar/payment')
const swarm = require('../swarm') // dazaar/swarm

const feed = hypercore('free-dazaar/some-data-we-are-offering-free')

setInterval(function () {
  feed.append('hello! ' + Date.now() + '\n')
}, 1000)

const market = dazaar('free-dazaar')
let payment = null

const seller = market.sell(feed, {
  validate (remoteKey, done) {
    payment.validate(remoteKey, function (err, info) {
      console.log('Validated', remoteKey.toString('hex'), err, info)
      done(err, info)
    })
  }
})

seller.ready(function () {
  const card = {
    id: seller.key.toString('hex'),
    payment: []
  }

  payment = new Payment(seller, card.payment)

  console.log('Offering! Dazaar card:')
  console.log(JSON.stringify(card, null, 2))

  swarm(seller, () => {
    const buyer = market.buy(seller.key, { sparse: true })

    buyer.on('validate', function () {
      console.log('remote validated us')
    })

    buyer.on('valid', function (info) {
      console.log('now valid -->', info)
    })

    buyer.on('feed', function () {
      console.log('got feed')
      buyer.feed.get(0, (_err, el) => {
        console.log('first element:', el.toString())
      })
    })

    swarm(buyer)
  })
})
