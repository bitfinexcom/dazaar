const hypercore = require('hypercore')
const market = require('./market')

const seller = market('./tmp/seller')
const buyer = market('./tmp/buyer')
const feed = hypercore('./tmp/feed')

require('util').inspect.defaultOptions.depth = Infinity

feed.ready(function () {
  if (feed.length === 0) feed.append('valuable data')
})

seller.sell(feed, {
  validate (from, cb) {
    console.log('someone wants to purchase our feed:', from)
    cb(null, true)
  }
}, function (err, sale) {
  if (err) throw err

  console.log('existing sales:', sale)

  feed.ready(function () {
    buyer.buy(feed.key, { hello: 'world' }, function (err, feed) {
      if (err) throw err
      console.log('we got our feed:', feed)
      feed.get(0, console.log)
    })
  })
})
