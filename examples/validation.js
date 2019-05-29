const hypercore = require('hypercore')
const market = require('../market')
const swarm = require('../swarm')
const path = require('path')
const raf = require('random-access-file')
const prefixPath = prefix => f => raf(path.join('./storage', prefix, f))

const mseller = market(prefixPath('dazaar/seller'))
const feed = hypercore(prefixPath('dazaar/seller-feed'))

setInterval(function () {
  feed.append('' + Date.now())
}, 1000)

var futureBuyerKey // this will be set async later
const seller = mseller.sell(feed, {
  validate: function (key, cb) {
    if (key.equals(futureBuyerKey) === false) return cb(new Error('Unknown key'))

    return cb()
  }
})

swarm(seller)

seller.ready(function (err) {
  if (err) throw err

  const mbuyer = market(prefixPath('dazaar/buyer'))
  const buyer = mbuyer.buy(seller.key)

  buyer.ready(function (err) {
    if (err) throw err

    futureBuyerKey = buyer.key
    console.log(futureBuyerKey)

    buyer.on('feed', function () {
      buyer.feed.createReadStream({ live: true }).on('data', function (chunk) {
        console.log('Data: ', chunk.toString())
      })
    })

    buyer.on('validate', function () {
      console.log('Validated!')
    })

    swarm(buyer)
  })
})
