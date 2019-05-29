# dazaar

![Dazaar logo](docs/logo.png)

> Marketplace for selling and buying `hypercores`

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

seller.ready(function (err) {
  if (err) throw err // Do proper error handling
  console.log('seller key pair fully loaded ...')

  const buyer = m.buy(seller.key)

  buyer.on('feed', function () {
    console.log('got the feed!')
    buyer.feed.get(0, function (err, data) {
      if (err) throw err // Do proper error handling
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

Create a new dazaar instance. Pass a `string` if you want to use the default
file storage or a [`random-access-storage`][ras] compatible `storage`.
Examples include (but not limited to):
 - [`random-access-file` (`raf`)][raf]
 - [`random-access-memory` (`ram`)][ram]
 - [`random-access-web` (`raw`)][raw]

#### `const seller = market.sell(feed, options)`

Sell a [`hypercore`][hypercore] by creating a new `seller`.

Options include:

```js
{
   // Predicate whether a remote key can get replicate this feed,
   // remoteKey being a Buffer to check and cb being a callback which can be
   // passed an error as the first argument, causing replication to fail, ie.
   // the buyer has not paid. The err.message will be passed back to the buyer
   // and can be used to specify a reason for the rejection
  validate (remoteKey, cb) {},
  // How often to call the above validate function in milliseconds.
  // Default is 1000ms
  validateInterval: 1000
}
```

You can use [`random-access-corestore` (`rac`)][rac] to manage multiple
named feeds.

#### `seller.buyers(cb)`

Get a list of all the buyers of this feed

#### `seller.on('ready')`

Emitted when the seller is fully ready and has loaded it's keypair

#### `seller.ready(cb)`

Call `cb` when the `seller` object is fully initialised, optionally with an
`error`. Similar to the event, but will call immediately if the event has
already fired.

#### `seller.on('validate', remoteKey)`

Event when the seller receives a `remoteKey`, but before the the `validate`
function is called. `remoteKey` a Buffer, and the same reference passed to
`validate`.

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

The buyer static public key. A `dazaar` instance uses the same public key for all
`.buy` calls. This is the remote key the seller sees in the validate function.
If you want to use multiple different identities you must have multiple `dazaar`
instances backed by different storage.

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

#### `const bool = market.isSeller(instance)`

Helper to determine if an instance is a seller.

#### `const bool = market.isBuyer(instance)`

Helper to determine if an instance is a buyer.

## Swarm

A network swarm based on [`hyperswarm`][hyperswarm] is included as
`dazaar/swarm`

```js
const swarm = require('dazaar/swarm')

swarm(buyer) // swarms the buyer
swarm(seller) // swarms the seller
```

#### `const sw = swarm(buyerOrSeller, [onerror], [opts])`

Create a new [`hyperswarm`][hyperswarm] for a `buyer` or `seller`, optionally
passing a `onerror` handling function and `opts` to pass to `hyperswarm`.

## License

MIT

[hypercore]: https://github.com/mafintosh/hypercore
[ras]: https://github.com/random-access-storage/random-access-storage
[raf]: https://github.com/random-access-storage/random-access-file
[ram]: https://github.com/random-access-storage/random-access-memory
[raw]: https://github.com/random-access-storage/random-access-web
[rac]: https://github.com/andrewosh/random-access-corestore
[hyperswarm]: https://github.com/hyperswarm/network
