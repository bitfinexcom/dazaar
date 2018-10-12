# hypermarket

Share hypercores on a one to one basis like a marketplace

```
npm install hypermarket
```

## Usage

First setup a seller

```js
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
```

## API

#### `const market = hypermarket(storage)`

Create a new hypermarket instance

#### `const seller = market.sell(feed, options)`

Sell a hypercore by creating a new seller.

Options include:

```js
{
  validate (remoteKey, cb) // wheather a remote key can get a copy of this feed,
  validateInterval: 1000 // how often to validate
}
```

#### `seller.buyers(cb)`

Get a list of all the buyers of this feed

#### `seller.on('ready')`

Emitted when the seller is fully ready and has loaded it's keypair

#### `seller.key`

The public key of this seller. Needed to buy the data.

#### `const buyer = market.buy(sellerKey)`

Buy a hypercore by creating a buyer instance.
It is expected that the remote seller can verify that you purchased
the data through a third party some how

#### `buyer.on('ready')`

Emitted when the buyer is fully ready and has fully loaded it's keypair.

#### `buyer.key`

The buyer public key. All buyers have the same public key through out the market
instance. This is the remote key the seller sees in the validate function

#### `buyer.seller`

The seller public key.

#### `buyer.on('feed', feed)`

Emitted when we have a feed.
If we previously succesfully validated this is triggered right away.
Otherwise it is triggerd after the first remote validation.

#### `buyer.on('validate')`

Emitted first time a remote validates us.

#### `buyer.feed`

The feed we bought

## Swarm

(TODO)

## License

MIT
