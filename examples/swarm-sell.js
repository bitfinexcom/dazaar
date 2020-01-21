const hypercore = require('hypercore')
const swarm = require('../swarm')
const market = require('../market')

const m = market('./tmp-seller')
const feed = hypercore('./tmp/data')

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore', remoteKey)
    cb(null)
  }
})

swarm(seller, function () {
  console.log('Seller fully announced and ready.')
  console.log('Seller key is ' + seller.key.toString('hex'))
  console.log('Run node swarm-buy.js ' + seller.key.toString('hex') + ' on another computer/process')
})
