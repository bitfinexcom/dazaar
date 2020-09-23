# dazaar

![Dazaar logo](docs/logo.png)

> Marketplace for selling and buying `hypercores`

```
npm install dazaar
```

Learn more about Dazaar in our [intro blogpost](https://blog.dazaar.com/2020/09/12/introducing-dazaar/) and [whitepaper](./docs/whitepaper.md).

## Usage

First setup a seller

```js
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('dazaar')

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

#### `const market = dazaar(storage, [options])`

Create a new dazaar instance. Pass a `string` if you want to use the default
file storage or a [`random-access-storage`][ras] compatible `storage`.
Examples include (but not limited to):
 - [`random-access-file` (`raf`)][raf]
 - [`random-access-memory` (`ram`)][ram]
 - [`random-access-web` (`raw`)][raw]

Options include:

```js
{
  masterKey: <32-byte-master-key>
}
```

If you set the master key all future key pairs, hypercore keys will be derived deterministicly from
that.

#### `const masterKey = dazaar.masterKey()`

Generate a new master key.

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
   // If you pass a info object to the callback when succesfully validating
   // the buyer, this object will be forwarded to the buyer (see the 'valid' event).
  validate (remoteKey, cb) {},
  // How often to call the above validate function in milliseconds.
  // Default is 1000ms
  validateInterval: 1000,
  // Set uniqueFeed to false to generate the same Hypercore feed for each
  // buyer. Should only be used for free Hypercores (defaults to true)
  uniqueFeed: true
}
```

You can use [`random-access-corestore` (`rac`)][rac] to manage multiple
named feeds.

For more info on how to implement a validator see the ["Writing your own payment validator" section](#writing-your-own-payment-validator)

#### `seller.buyers(cb)`

Get a list of all the buyers of this feed

#### `seller.on('ready')`

Emitted when the seller is fully ready and has loaded it's keypair

#### `seller.ready(cb)`

Call `cb` when the `seller` object is fully initialised, optionally with an
`error`. Similar to the event, but will call immediately if the event has
already fired.

#### `seller.on('buyer-validate', remoteKey)`

Event when the seller receives a `remoteKey`, but before the the `validate`
function is called. `remoteKey` a Buffer, and the same reference passed to
`validate`.

#### `seller.on('buyer-valid', remoteKey, info)`

Emitted every time we succesfully validate a buyer.

#### `seller.on('buyer-invalid', remoteKey, error)`

Emitted when we invalidate a remote buyer.

#### `seller.on('valid', info, stream)`

Emitted when a remote buyer validates the seller.
Note that this is only relevant if the seller does buyer validation.

The stream is the replication stream associated with the session.
See `stream.remotePublicKey` to get the public key of the buyer.

#### `seller.on('invalid', info, stream)`

Emitted when a remote buyer invalidates the seller.
Note that this is only relevant if the seller does buyer validation.

The stream is the replication stream associated with the session.
See `stream.remotePublicKey` to get the public key of the buyer.

#### `seller.discoveryKey`

A hash of the sellers public key that can be used for discovery purposes, eg.
peer discovery on a DHT. See the [Swarm](#swarm) section below.

#### `seller.key`

The public key of this seller. Must be communicated to potential buyers, as
this is needed in the handshake to buy the data.

#### `seller.broadcast(type, message)`

Send a custom message to all the buying peers you are connected to.

#### `seller.send(type, message, streamOrBuyerKey)`

Send a custom message to a specific buyer you are connected to.

You specify the peer by either providing the replication stream or the public key identifying the buyer.

#### `seller.connectedBuyers`

A list of all the buyers (their public keys) you are currently connected to.

#### `seller.receive(type, onmessage)`

Setup a handler to be called when a buying peer sends a message of a specific type.
`onmessage` is called with `message` which is the message the remote send and `stream`
which represents the stream it was sent on.

Use `stream.remotePublicKey` to get the remotes buyer key out.

#### `seller.destroy([cb])`

Destroy the seller instance. Closes the attached Hypercore and any open replication streams.
Will unannounce from any attached swarm as well.

#### `seller.on('peer-add', stream)`

Emitted when a remote peer is authenticated and has been connected.

#### `seller.on('peer-remove', stream)`

Emitted when a remote peer has disconnected.

#### `seller.peers`

An array of all remote connected peers.

#### `const buyer = market.buy(sellerKey|dazaarCard, [options])`

Buy a hypercore by creating a buyer instance.
It is expected that the remote seller can verify that you purchased
the data through a third party some how.

If a `sellerKey` is used, it must be a Buffer.

Options include:

``` js
{
  // Set this to true if you do not want to download all data but only
  // the data you as for
  sparse: false
  // In case you want to optionally validate the seller before downloading
  // any data you can pass in a validate function similar to above as well.
  validate (remoteKey, cb) {},
  // How often to call the above validate function in milliseconds.
  // Default is 1000ms
  validateInterval: 1000
}
```

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

#### `buyer.on('validated')`

Emitted first time a remote seller validates us.

#### `buyer.on('valid', info, stream)`

Emitted everytime the remote seller sends us some updated info about our valid subscription.

#### `buyer.on('invalid', err, stream)`

Emitted when a remote seller invalidates us with the error they provided.

#### `buyer.on('seller-validate', remoteKey)`

Event when the buyer receives a `remoteKey`, but before the the `validate`
function is called. `remoteKey` a Buffer, and the same reference passed to
`validate`. Only emitted if you pass in a `validate` function in the constructor.

#### `buyer.on('seller-valid', remoteKey, info)`

Emitted every time we succesfully validate a buyer.

#### `buyer.on('seller-invalid', remoteKey, error)`

Emitted when we invalidate a remote buyer.

#### `buyer.feed`

The feed we bought.

#### `buyer.broadcast(type, message)`

Send a custom message to the selling peers you are connected to.

#### `buyer.send(type, message, streamOrPublicKey)`

Send a custom message to a specific selling peer you are connected to.

You specify the peer by either providing the replication stream or the public key identifying the seller.

#### `buyer.receive(type, onmessage)`

Setup a handler to be called when a selling peer sends a message of a specific type.
`onmessage` is called with `message` which is the message the remote send and `stream`
which represents the stream it was sent on.

Use `stream.remotePublicKey` to get the remotes buyer key out.

#### `buyer.destroy([cb])`

Destroy the buyer instance. Closes the attached Hypercore and any open replication streams.
Will unannounce from any attached swarm as well.

#### `buyer.on('peer-add', stream)`

Emitted when a remote peer is authenticated and has been connected.

#### `buyer.on('peer-remove', stream)`

Emitted when a remote peer has disconnected.

#### `buyer.peers`

An array of all remote connected peers.

#### `market.selling(callback)`

Get a list of the hypercores and their corresponding sales key you are selling (since you created the market).

#### `const bool = market.isSeller(instance)`

Helper to determine if an instance is a seller.

#### `market.buying(callback)`

Get a list of hypercores and their corresponding sales key you are buying (since you created the market).

#### `const bool = market.isBuyer(instance)`

Helper to determine if an instance is a buyer.

#### `const { publicKey, secretKey } = market.deriveHypercoreKeyPair(id)`

Derive a ED25519 keypair that can uses for a hypercore off the master key.

#### `market.destroy([cb])`

Destroy the market instance. Closes internal state needed for the buyer and sellers.

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

## Writing your own payment validator

To write your own payment validator you need to implement the validate function that is passed
to the Dazaar seller or buyer instance. This function is called every ~1s to validate whether
or not the current remote buyer or seller is valid.

The validate function is called with the following signature

```js
function validate (remotePublicKey, done) {
  // call done(null) if the public is valid
  // otherwise call done(err)
}
```

Basically inside the validate function you should validate against your payment processor
or however you want to validate that that the session identified by your public key (i.e. `seller.key`) and
the remote public key is currently valid.

As an example if using a blockchain that supports adding metadata to a payment then
you can include the following metadata to indicate that this payment was for this session:

```
dazaar: <seller-public-key-in-hex> <buyer-public-key-in-hex>
```

Then in the validate function you'd list all payments matching the above metadata, and
track when they were performed. If you add them together in relation with the their relative
timestamps and substract the current pricing in terms of "stream cost per time interval",
then you can calcuate whether or not their current session is paid for or if the other side
needs to perform a payment.

If paid for, again you indicate that by calling `validate(null)` and if not `validate(new Error('Needs payment'))`
or a similar error.

This simple system makes Dazaar flexible in regards to payments. You can choose to validate the peers
any way you want. For example even a scheme like payment through Twitter posts could be enabled.

There is a series of implemented payment providers available through the [@dazaar/payment] module as well.
You can read more about that [here](https://github.com/bitfinexcom/dazaar-payment).

## CLI

There is a small CLI available as well to help you buy, sell, and replicate Hypercores
using the command line with a couple of payment options bundled in.

You can read more about it in the CLI repo, https://github.com/bitfinexcom/dazaar-cli

```
npm install -g @dazaar/cli
```

## License

MIT

[hypercore]: https://github.com/mafintosh/hypercore
[ras]: https://github.com/random-access-storage/random-access-storage
[raf]: https://github.com/random-access-storage/random-access-file
[ram]: https://github.com/random-access-storage/random-access-memory
[raw]: https://github.com/random-access-storage/random-access-web
[rac]: https://github.com/andrewosh/random-access-corestore
[hyperswarm]: https://github.com/hyperswarm/hyperswarm
