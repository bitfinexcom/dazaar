const hypertrie = require('hypertrie')
const hypercore = require('hypercore')
const crypto = require('hypercore-crypto')
const multikey = require('hypercore-multi-key')
const raf = require('random-access-file')
const thunky = require('thunky')
const { EventEmitter } = require('events')
const Protocol = require('hypercore-protocol')
const derive = require('derive-key')

exports = module.exports = (storage, opts) => new Market(storage, opts)

exports.isSeller = function (s) {
  return s instanceof Seller
}

exports.isBuyer = function (b) {
  return b instanceof Buyer
}

class Market extends EventEmitter {
  constructor (storage, opts) {
    super()

    this._storage = typeof storage === 'function' ? storage : defaultStorage
    this._db = hypertrie(name => this._storage('db/' + name), { valueEncoding: 'json' })
    this._keyPair = null

    const self = this

    this.masterKey = (opts && opts.masterKey) || null
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

  setConfig (key, val, cb) {
    this._db.put('config/' + key, val, { condition: noDups }, function (err) {
      if (cb) cb(err)
    })

    function noDups (oldNode, newNode, cb) {
      cb(null, !oldNode || (JSON.stringify(oldNode.value) !== JSON.stringify(newNode.value)))
    }
  }

  getConfig (key, cb) {
    this._db.get('config/' + key, function (err, node) {
      cb(err, node ? node.value : null)
    })
  }

  _ready (cb) {
    const self = this

    this._loadMasterKey(function (err) {
      if (err) return cb(err)
      self._keyPair = Protocol.keyPair(derive('dazaar', self.masterKey, 'buys/key-pair'))
      cb(null)
    })
  }

  _loadMasterKey (cb) {
    this._db.get('master-key', (err, masterKey) => {
      if (err) return cb(err)

      if (masterKey) {
        this.masterKey = Buffer.from(masterKey.value, 'hex')
        return cb(null)
      }

      this.masterKey = this.masterKey || crypto.randomBytes(32)
      this._db.put('master-key', this.masterKey.toString('hex'), cb)
    })
  }

  buying (cb) {
    this._db.list('buys/feeds', { recursive: false }, function (err, nodes) {
      if (err) return cb(err)
      const list = nodes.map(function (node) {
        const key = Buffer.from(node.key.split('/')[2], 'hex')
        const feed = Buffer.from(node.value.uniqueFeed, 'hex')
        return { key, feed }
      })
      cb(null, list)
    })
  }

  destroy (cb) {
    this._db.feed.close(cb)
  }

  selling (cb) {
    const self = this
    this._db.list('sales', { recursive: false }, function (err, nodes) {
      if (err) return cb(err)

      const list = []
      const feeds = nodes.map(function (node) {
        return Buffer.from(node.key.split('/')[1], 'hex')
      })

      loop(null, null)

      function loop (err, node) {
        if (err) return cb(err)
        if (node) list.push({ key: decodeKeys(node.value).publicKey, feed: feeds[list.length] })
        if (list.length === feeds.length) return cb(null, list)
        const feed = feeds[list.length]
        self._db.get('sales/' + feed.toString('hex') + '/key-pair', loop)
      }
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
    this.info = null
    this.destroyed = false
    this.validate = opts.validate
    this.revalidate = opts.validateInterval || 1000

    this._db = db
    this._market = market
    this._receiving = new Map()
    this._sendable = new Set()
    this._swarm = null

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

  receive (name, fn) {
    this._receiving.set(name, fn)
  }

  send (name, message, publicKey) {
    if (typeof publicKey === 'string') publicKey = Buffer.from(publicKey, 'hex')

    for (const m of this._sendable) {
      if (m.stream === publicKey || (Buffer.isBuffer(publicKey) && m.stream.remotePublicKey && m.stream.remotePublicKey.equals(publicKey))) {
        m.userMessage.send({ name, message })
      }
    }
  }

  broadcast (name, message) {
    for (const m of this._sendable) m.userMessage.send({ name, message })
  }

  get peers () {
    const peers = []
    for (const { stream } of this._sendable) {
      if (stream.remotePublicKey) peers.push(stream)
    }
    return peers
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

  destroy (cb) {
    if (this.destroyed) return
    this.destroyed = true

    if (!cb) cb = noop

    this.ready((err) => {
      if (err) return cb(err)

      if (this._swarm) {
        this._swarm.leave(this.discoveryKey)
        this._swarm = null
      }
      for (const { stream } of this._sendable) {
        stream.destroy(new Error('Buyer is destroyed'))
      }

      if (this.feed) this.feed.close(cb)
      else cb(null)
    })
  }

  replicate (initiator) {
    if (typeof initiator !== 'boolean') initiator = true
    if (this.destroyed) throw new Error('Buyer is destroyed')

    const self = this
    let timeout
    let isValid

    const p = new Protocol(initiator, {
      keyPair (done) {
        self._market.ready(function (err) {
          if (err) return done(err)
          done(null, self._market._keyPair)
        })
      },
      onauthenticate (remotePublicKey, done) {
        if (remotePublicKey.equals(self.seller)) return done(null)
        const error = new Error('Not connected to seller')
        self.emit('invalid', error, p)
        done(error)
      },
      onhandshake () {
        process.nextTick(function () {
          if (p.destroyed) return
          self.emit('peer-add', p)
          p.on('close', () => self.emit('peer-remove', p))
        })
      }
    })

    registerUserMessage(this, p)

    p.registerExtension('dazaar/seller-id', {
      onmessage (sellerId) {
        p.emit('seller-id', sellerId)
      }
    })

    p.registerExtension('dazaar/one-time-feed', {
      onmessage (uniqueFeed) {
        const feed = self._setFeed(uniqueFeed)
        self.emit('validated', uniqueFeed, p)
        feed.replicate(p, { live: true })
      }
    })

    const valid = p.registerExtension('dazaar/valid', {
      encoding: 'json',
      onmessage (info) {
        self.info = info
        self.emit('valid', info, p)
      }
    })

    const invalid = p.registerExtension('dazaar/invalid', {
      encoding: 'json',
      onmessage (info) {
        self.emit('invalid', new Error(info.error), p)
      }
    })

    if (this.validate) {
      if (this.feed) validate()
      else this.once('feed', validate)
      p.on('close', function () {
        self.removeListener('feed', validate)
        clearTimeout(timeout)
      })
    }

    return p

    function validate () {
      if (p.destroyed) return
      self.feed.setDownloading(false)
      self.emit('seller-validate', p.remotePublicKey)
      self.validate(p.remotePublicKey, function (err, info) {
        if (p.destroyed) return
        setDownloading(err, info)
      })
    }

    function setDownloading (error, info) {
      const downloading = !error
      if (self.feed) {
        self.feed.setDownloading(downloading)
      }

      if (error) {
        if (isValid !== false) {
          isValid = false
          invalid.send({ error: error.message })
          self.emit('seller-invalid', p.remotePublicKey, error)
        }
      } else {
        if (isValid !== true) {
          isValid = true
        }
        if (info && typeof info === 'object') {
          self.emit('seller-valid', p.remotePublicKey, info)
          valid.send(info)
        } else {
          self.emit('seller-valid', p.remotePublicKey, null)
        }
      }

      timeout = setTimeout(validate, self.revalidate)
    }
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
    this.uniqueFeed = opts.uniqueFeed !== false
    this.validate = opts.validate
    this.revalidate = opts.validateInterval || 1000
    this.info = null
    this.sellerId = crypto.randomBytes(32)
    this.destroyed = false

    if (!this.uniqueFeed) {
      this.validate = (remoteKey, done) => done(null, { free: true })
    }

    this._db = db
    this._market = market
    this._keyPair = null
    this._receiving = new Map()
    this._sendable = new Set()

    const self = this

    this.ready = thunky(this._ready.bind(this))
    this.ready(function (err) {
      if (err) self.emit('error', err)
      else self.emit('ready')
    })
  }

  receive (name, fn) {
    this._receiving.set(name, fn)
  }

  send (name, message, publicKey) {
    if (typeof publicKey === 'string') publicKey = Buffer.from(publicKey, 'hex')

    for (const m of this._sendable) {
      if (m.stream === publicKey || (Buffer.isBuffer(publicKey) && m.stream.remotePublicKey && m.stream.remotePublicKey.equals(publicKey))) {
        m.userMessage.send({ name, message })
      }
    }
  }

  broadcast (name, message) {
    for (const m of this._sendable) m.userMessage.send({ name, message })
  }

  get connectedBuyers () {
    return this.peers.map(stream => stream.remotePublicKey)
  }

  get peers () {
    const peers = []
    for (const { stream } of this._sendable) {
      if (stream.remotePublicKey) peers.push(stream)
    }
    return peers
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
      loadKey(self._market, self._db, key, function (err, kp) {
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

  destroy (cb) {
    if (this.destroyed) return
    this.destroyed = true

    if (!cb) cb = noop

    this.ready((err) => {
      if (err) return cb(err)

      if (this._swarm) {
        this._swarm.leave(this.discoveryKey)
        this._swarm = null
      }
      for (const { stream } of this._sendable) {
        stream.destroy(new Error('Seller is destroyed'))
      }

      if (this.feed) this.feed.close(cb)
      else cb(null)
    })
  }

  replicate (initiator) {
    if (typeof initiator !== 'boolean') initiator = false
    if (this.destroyed) throw new Error('Seller is destroyed')

    const self = this

    let uniqueFeed
    let timeout
    let isValid

    const p = new Protocol(initiator, {
      keyPair (done) {
        self.ready(function (err) {
          if (err) return done(err)
          done(null, self._keyPair)
        })
      },
      onauthenticate (remotePublicKey, done) {
        done()
      },
      onhandshake () {
        validate()

        process.nextTick(function () {
          if (p.destroyed) return
          self.emit('peer-add', p)
          p.on('close', () => self.emit('peer-remove', p))
        })

        function setUploading (error, info) {
          const uploading = !error
          if (uniqueFeed) {
            uniqueFeed.setUploading(uploading)
          }

          if (error) {
            if (isValid !== false) {
              isValid = false
              invalid.send({ error: error.message })
              self.emit('buyer-invalid', p.remotePublicKey, error)
            }
          } else {
            if (isValid !== true) {
              isValid = true
            }
            if (info && typeof info === 'object') {
              self.info = info
              self.emit('buyer-valid', p.remotePublicKey, info)
              valid.send(info)
            } else {
              self.emit('buyer-valid', p.remotePublicKey, null)
            }
          }

          timeout = setTimeout(validate, self.revalidate)
        }

        function onvalidate (err, info) {
          if (err) return setUploading(err, null)
          getUniqueFeed(function (err, feed) {
            if (err) return p.destroy(err)
            if (!uniqueFeed) {
              uniqueFeed = feed
              oneTimeFeed.send(feed.key)
              uniqueFeed.replicate(p, { live: true })
            }
            setUploading(null, info)
          })
        }

        function validate () {
          if (p.destroyed) return
          self.emit('buyer-validate', p.remotePublicKey)
          self.validate(p.remotePublicKey, function (err, info) {
            if (p.destroyed) return
            onvalidate(err, info)
          })
        }
      }
    })

    const oneTimeFeed = p.registerExtension('dazaar/one-time-feed')
    const id = p.registerExtension('dazaar/seller-id')

    const valid = p.registerExtension('dazaar/valid', {
      encoding: 'json',
      onmessage (info) {
        self.emit('valid', info, p)
      }
    })

    const invalid = p.registerExtension('dazaar/invalid', {
      encoding: 'json',
      onmessage (info) {
        self.emit('invalid', info, p)
      }
    })

    id.send(this.sellerId)
    registerUserMessage(this, p)

    p.on('close', function () {
      clearTimeout(timeout)
      if (uniqueFeed && uniqueFeed !== self.feed) uniqueFeed.close()
    })

    return p

    function getUniqueFeed (cb) {
      if (!self.uniqueFeed) {
        self.feed.ready(function (err) {
          if (err) return cb(err)
          cb(null, self.feed)
        })
        return
      }

      if (uniqueFeed) return cb(null, uniqueFeed)
      getUniqueKeyPair(function (err, keyPair) {
        if (err) return cb(err)
        if (p.destroyed) return cb(new Error('Stream destroyed'))
        const feed = multikey(self.feed, decodeKeys(keyPair))
        feed.ready(function (err) {
          if (err) return cb(err)
          if (p.destroyed) {
            feed.close()
            return cb(new Error('Stream destroyed'))
          }
          self.emit('buyer-feed', feed, p.remotePublicKey)
          cb(null, feed)
        })
      })
    }

    function getUniqueKeyPair (cb) {
      const key = 'sales/' + self.feed.key.toString('hex') + '/feeds/' + p.remotePublicKey.toString('hex')

      self._db.get(key, function (err, node) {
        if (err) return cb(err)

        if (!node) {
          const keyPair = crypto.keyPair(derive('dazaar', self._market.masterKey, key))
          self._db.put(key, { buyer: p.remotePublicKey.toString('hex'), uniqueFeed: encodeKeys(keyPair) }, function (err) {
            if (err) return cb(err)
            cb(null, keyPair)
          })
          return
        }

        cb(null, decodeKeys(node.value.uniqueFeed))
      })
    }
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

function registerUserMessage (self, stream) {
  const userMessage = stream.registerExtension('dazaar/user-message', {
    encoding: 'json',
    onmessage (data) {
      const fn = self._receiving.get(data.name)
      if (fn) fn(data.message, stream)
    }
  })

  const wrap = {
    stream,
    userMessage
  }

  self._sendable.add(wrap)
  stream.on('close', () => self._sendable.delete(wrap))
}

function loadKey (market, db, key, cb) {
  market.ready(function (err) {
    if (err) return cb(err)
    db.get(key, function (err, node) {
      if (err) return cb(err)
      if (node) return cb(null, decodeKeys(node.value))
      const keyPair = Protocol.keyPair(derive('dazaar', market.masterKey, key))
      db.put(key, encodeKeys(keyPair), function (err) {
        if (err) return cb(err)
        cb(null, keyPair)
      })
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

function noop () {}
