const noise = require('noise-peer')
const stream = require('stream')
const hypertrie = require('hypertrie')
const hypercore = require('hypercore')
const crypto = require('hypercore-crypto')
const multikey = require('hypercore-multi-key')
const pump = require('pump')
const duplexify = require('duplexify')
const raf = require('random-access-file')
const { EventEmitter } = require('events')

module.exports = storage => new Market(storage)

class Market extends EventEmitter {
  constructor (storage) {
    super()

    this._storage = typeof storage === 'function' ? storage : name => raf(storage + '/' + name)
    this._db = hypertrie(name => this._storage('db/' + name), { valueEncoding: 'json' })
    this._keyPair = null

    const self = this

    this.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })
  }

  get buyer () {
    return this._keyPair && this._keyPair.publicKey
  }

  ready (cb) {
    if (this._keyPair) return process.nextTick(cb, null)
    const self = this
    this._db.get('buys/key-pair', function (err, node) {
      if (err) return cb(err)
      if (self._keyPair) return cb(null)

      if (node) {
        self._keyPair = decodeKeys(node.value)
        return cb(null)
      }

      self._keyPair = noise.keygen()
      self._db.put('buys/key-pair', encodeKeys(self._keyPair), cb)
    })
  }

  sell (feed, opts) {
    return new Seller(this, this._db, feed, opts)
  }

  buy (seller) {
    return new Buyer(this, this._db, seller)
  }
}

class Buyer extends EventEmitter {
  constructor (market, db, seller) {
    super()

    this.seller = seller
    this.feed = null

    this._db = db
    this._market = market

    const self = this

    this._db.get('buys/feeds/' + this.seller.toString('hex'), function (err, node) {
      if (err || !node) return
      self._setFeed(Buffer.from(node.value.uniqueFeed, 'hex'))
    })

    this._market.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })
  }

  get key () {
    return this._market.key
  }

  replicate () {
    const [ a, b ] = createStreamProxy()
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
        const first = stream.read()
        const feed = self._setFeed(first)

        self.emit('validate', first)
        pump(stream, feed.replicate({ live: true, encrypt: false }), stream)
      })
    })
  }

  _setFeed (key) {
    const self = this
    if (this.feed) return this.feed
    const uniqueFeed = hypercore(name => this._market._storage('buys/' + key.toString('hex') + '/' + name), key)
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

    this.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })
  }

  get key () {
    return this._keyPair && this._keyPair.publicKey
  }

  ready (cb) {
    const self = this
    this.feed.ready(function (err) {
      if (err) return cb(err)
      const key = 'sales/' + self.feed.key.toString('hex') + '/key-pair'
      self._db.get(key, function (err, node) {
        if (err) return cb(err)
        if (self._keyPair) return cb(null)
        if (node) {
          self._keyPair = decodeKeys(node.value)
          return cb(null)
        }
        self._keyPair = noise.keygen()
        self._db.put(key, encodeKeys(self._keyPair), cb)
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

      const stream = noise(socket, false, {
        pattern: 'XK',
        staticKeyPair: self._keyPair,
        onstatickey: function (remoteKey, done) {
          const copy = Buffer.alloc(remoteKey.length)
          remoteKey.copy(copy)

          self.emit('validate', copy)
          self.validate(copy, function (err) {
            if (err) return done(err)
            timeout = setTimeout(check, self.revalidate)
            sell(copy)
            done(null)
          })

          function check () {
            self.emit('validate', copy)
            self.validate(copy, function (err) {
              if (stream.destroyed) return
              if (err) return stream.destroy(err)
              timeout = setTimeout(check, self.revalidate)
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

          stream.write(uniqueFeed.key) // send the key first
          pump(stream, uniqueFeed.replicate({ live: true, encrypt: false }), stream)
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
