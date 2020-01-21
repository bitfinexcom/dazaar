const hypercore = require('hypercore')
const swarm = require('../swarm')
const market = require('../market')

const m = market('./tmp-buyer')

const buyer = m.buy(Buffer.from(process.argv[2], 'hex'))

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
