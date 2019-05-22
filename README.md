# dazaar

Share hypercores on a one to one basis like a marketplace

```
npm install dazaar
```

## Usage

First setup a seller

```js
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('dazaar/market')

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

#### `const market = dazaar(storage)`

Create a new dazaar instance. Pass as [`random-access-storage`][ras] compatible
 `storage`. Examples include (but not limited to):
 - [`random-access-file` (`raf`)][raf]
 - [`random-access-memory` (`ram`)][ram]
 - [`random-access-web` (`raw`)][raw]

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

#### `seller.discoveryKey`

A hash of the sellers public key that can be used for discovery purposes, eg.
peer discovery on a DHT. See the [Swarm](#swarm) section below.

#### `seller.key`

The public key of this seller. Must be communicated to potential buyers, as
this is needed in the handshake to buy the data.

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

#### `buyer.discoveryKey`

A hash of the seller public key that can be used to discover the seller on a
network. See the [Swarm](#swarm) section below.

#### `buyer.on('feed', feed)`

Emitted when we have a feed.
If we previously successfully validated, this is triggered right away.
Otherwise it is triggered after the first remote validation.

#### `buyer.on('validate')`

Emitted first time a remote seller validates us.

#### `buyer.on('invalidate', err)`

Emitted when a remote seller invalidates us with the error they provided.

#### `buyer.feed`

The feed we bought.

#### `bool = market.isSeller(instance)`

Helper to determine if an instance is a seller.

#### `bool = market.isBuyer(instance)`

Helper to determine if an instance is a buyer.

## Swarm

A network swarm based on [`hyperswarm`][hyperswarm] is included as
`dazaar/swarm`

```js
const swarm = require('dazaar/swarm')

swarm(buyer) // swarms the buyer
swarm(seller) // swarms the seller
```

## License

MIT


[ras]: https://github.com/random-access-storage/random-access-storage
[raf]: https://github.com/random-access-storage/random-access-file
[ram]: https://github.com/random-access-storage/random-access-memory
[raw]: https://github.com/random-access-storage/random-access-web
[hyperswarm]: https://github.com/hyperswarm/network
