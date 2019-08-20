const noise = require('noise-peer')
const stream = require('stream')
const hypertrie = require('hypertrie')
const hypercore = require('hypercore')
const protocol = require('hypercore-protocol')
const crypto = require('hypercore-crypto')
const multikey = require('hypercore-multi-key')
const pump = require('pump')
const duplexify = require('duplexify')
const raf = require('random-access-file')
const thunky = require('thunky')
const { EventEmitter } = require('events')
const messages = require('./messages')

exports = module.exports = storage => new Market(storage)

exports.isSeller = function (s) {
  return s instanceof Seller
}

exports.isBuyer = function (b) {
  return b instanceof Buyer
}

class Market extends EventEmitter {
  constructor (storage) {
    super()

    this._storage = typeof storage === 'function' ? storage : defaultStorage
    this._db = hypertrie(name => this._storage('db/' + name), { valueEncoding: 'json' })
    this._keyPair = null

    const self = this

    this.ready = thunky(this._ready.bind(this))
    this.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })

    function defaultStorage (name) {
      const lock = name === 'db/bitfield' ? requireMaybe('fd-lock') : null
      return raf(name, { directory: storage, lock })
    }
  }

  get buyer () {
    return this._keyPair && this._keyPair.publicKey
  }

  _ready (cb) {
    const self = this

    loadKey(this._db, 'buys/key-pair', function (err, kp) {
      if (err) return cb(err)
      self._keyPair = kp
      cb(null)
    })
  }

  sell (feed, opts) {
    return new Seller(this, this._db, feed, opts)
  }

  buy (seller, opts) {
    return new Buyer(this, this._db, seller, opts)
  }
}

class Buyer extends EventEmitter {
  constructor (market, db, seller, opts) {
    if (!opts) opts = {}
    super()

    this.seller = seller
    this.feed = null
    this.sparse = !!opts.sparse

    this._db = db
    this._market = market

    const self = this

    this._db.get('buys/feeds/' + this.seller.toString('hex'), function (err, node) {
      if (err || !node) return
      self._setFeed(Buffer.from(node.value.uniqueFeed, 'hex'))
    })

    this.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })
  }

  get key () {
    return this._market.buyer
  }

  get discoveryKey () {
    return hypercore.discoveryKey(this.seller)
  }

  ready (cb) {
    this._market.ready(cb)
  }

  replicate () {
    const [ a, b ] = createStreamProxy()
    a.on('error', b.destroy.bind(b)) // preserve error message
    this.onsocket(a)
    return b
  }

  onsocket (socket) {
    const self = this

    this._market.ready(function (err) {
      if (err) return socket.destroy(err)

      const stream = noise(socket, true, {
        pattern: 'XK',
        remoteStaticKey: self.seller,
        staticKeyPair: self._market._keyPair
      })

      stream.on('error', noop)
      stream.once('readable', function () {
        const first = messages.Receipt.decode(stream.read())
        if (first.invalid) return self._destroy(new Error(first.invalid), socket)
        const feed = self._setFeed(first.uniqueFeed)

        self.emit('validate', first.uniqueFeed)

        const p = protocol({
          extensions: [ 'hypermarket/invalid' ]
        })

        pump(stream, feed.replicate({ live: true, encrypt: false, stream: p }), stream)

        feed.ready(function () {
          if (!p.feeds.length) return
          p.feeds[0].on('extension', function (name, data) {
            if (name === 'hypermarket/invalid') {
              self._destroy(new Error(data.toString()), socket)
              p.destroy()
            }
          })
        })
      })
    })
  }

  _destroy (err, socket) {
    socket.destroy(err)
    this.emit('invalidate', err)
  }

  _setFeed (key) {
    const self = this
    if (this.feed) return this.feed
    const uniqueFeed = hypercore(name => this._market._storage('buys/' + key.toString('hex') + '/' + name), key, {
      sparse: this.sparse
    })
    this.feed = uniqueFeed
    const k = 'buys/feeds/' + this.seller.toString('hex')
    this._db.get(k, function (err, node) {
      if (err || node) return
      self._db.put(k, { seller: self.seller.toString('hex'), uniqueFeed: key.toString('hex') })
    })
    this.feed.ready(() => this.emit('feed', this.feed))
    return uniqueFeed
  }
}

class Seller extends EventEmitter {
  constructor (market, db, feed, opts) {
    if (typeof opts === 'function') opts = { validate: opts }
    super()

    this.feed = feed
    this.validate = opts.validate
    this.revalidate = opts.validateInterval || 1000

    this._db = db
    this._market = market
    this._keyPair = null

    const self = this

    this.ready = thunky(this._ready.bind(this))
    this.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })
  }

  get key () {
    return this._keyPair && this._keyPair.publicKey
  }

  get discoveryKey () {
    return this.key && hypercore.discoveryKey(this.key)
  }

  _ready (cb) {
    const self = this
    this.feed.ready(function (err) {
      if (err) return cb(err)
      const key = 'sales/' + self.feed.key.toString('hex') + '/key-pair'
      loadKey(self._db, key, function (err, kp) {
        if (err) return cb(err)
        self._keyPair = kp
        cb(null)
      })
    })
  }

  buyers (cb) {
    const self = this
    const list = []

    this.feed.ready(function (err) {
      if (err) return cb(err)

      const ite = self._db.iterator('sales/' + self.feed.key.toString('hex') + '/feeds')

      ite.next(function loop (err, node) {
        if (err) return cb(err)
        if (!node) return cb(null, list)

        list.push({
          buyer: Buffer.from(node.value.buyer, 'hex'),
          uniqueFeed: decodeKeys(node.value.uniqueFeed)
        })

        ite.next(loop)
      })
    })
  }

  replicate () {
    const [ a, b ] = createStreamProxy()
    this.onsocket(a)
    return b
  }

  onsocket (socket) {
    const self = this
    let timeout

    this.ready(function (err) {
      if (err) return socket.destroy(err)

      let p

      const stream = noise(socket, false, {
        pattern: 'XK',
        staticKeyPair: self._keyPair,
        onstatickey: function (remoteKey, done) {
          const copy = Buffer.alloc(remoteKey.length)
          remoteKey.copy(copy)

          check(function () {
            sell(copy)
            done(null)
          })

          function check (after) {
            after = after || noop
            self.emit('validate', copy)
            self.validate(copy, function (err) {
              if (stream.destroyed) return
              if (err) {
                if (!p.remoteSupports('hypermarket/invalid') || !p.feeds.length) return stream.destroy(err)
                p.feeds[0].extension('hypermarket/invalid', Buffer.from(err.message))
                stream.end()
                return
              }
              timeout = setTimeout(check, self.revalidate)
              after()
            })
          }
        }
      })

      stream.on('error', noop)
      stream.on('close', onclose)
      stream.on('end', onclose)

      function onclose () {
        if (timeout) clearTimeout(timeout)
        timeout = null
      }

      function sell (remoteKey) {
        const key = 'sales/' + self.feed.key.toString('hex') + '/feeds/' + remoteKey.toString('hex')
        self._db.get(key, function (err, node) {
          if (err) return stream.destroy(err)

          if (!node) {
            const keyPair = crypto.keyPair()
            self._db.put(key, { buyer: remoteKey.toString('hex'), uniqueFeed: encodeKeys(keyPair) }, function (err) {
              if (err) return stream.destroy(err)
              sell(remoteKey)
            })
            return
          }

          const uniqueFeed = multikey(self.feed, decodeKeys(node.value.uniqueFeed))

          p = protocol({
            extensions: [ 'hypermarket/invalid' ]
          })

          stream.write(messages.Receipt.encode({ uniqueFeed: uniqueFeed.key })) // send the key first
          pump(stream, uniqueFeed.replicate({ live: true, encrypt: false, stream: p }), stream)
        })
      }
    })
  }
}

function decodeKeys (keys) {
  return {
    publicKey: Buffer.from(keys.publicKey, 'hex'),
    secretKey: Buffer.from(keys.secretKey, 'hex')
  }
}

function encodeKeys (keys) {
  return {
    publicKey: keys.publicKey.toString('hex'),
    secretKey: keys.secretKey.toString('hex')
  }
}

function createStreamProxy () {
  const inc = new stream.PassThrough()
  const out = new stream.PassThrough()
  const a = duplexify(inc, out)
  const b = duplexify(out, inc)

  return [a, b]
}

function noop () {}

function loadKey (db, key, cb) {
  db.get(key, function (err, node) {
    if (err) return cb(err)
    if (node) return cb(null, decodeKeys(node.value))
    const keyPair = noise.keygen()
    db.put(key, encodeKeys(keyPair), function (err) {
      if (err) return cb(err)
      cb(null, keyPair)
    })
  })
}

function requireMaybe (name) {
  try {
    return require(name)
  } catch (_) {
    return null
  }
}
