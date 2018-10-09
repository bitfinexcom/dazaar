const multiKey = require('hypercore-multi-key')
const hypertrie = require('hypertrie')
const hypercore = require('hypercore')
const network = require('@hyperswarm/network')
const jsonStream = require('duplex-json-stream')
const crypto = require('hypercore-crypto')
const pump = require('pump')
const protocol = require('hypercore-protocol')

module.exports = storage => new Market(storage)

class Market {
  constructor (storage) {
    this.storage = storage
    this.market = hypertrie(storage, { valueEncoding: 'json' })
    this.interaction = network()
    this.feeds = network() // TODO: reuse swarm
    this.sales = new Map()
    this.buys = []
    this._swarming = new Map()

    const self = this

    this.feeds.on('connection', function (socket, info) { 
      const p = protocol()
      pump(socket, p, socket)

      if (info.client) ondisc(info.peer.topic)
      else p.on('feed', ondisc)

      function ondisc (disc) {
        const feed = self._swarming.get(disc.toString('hex'))
        if (feed) feed.replicate({ stream: p, live: true })
      }
    })

    this.interaction.on('connection', function (socket) {
      const messages = jsonStream(socket)

      messages.on('data', function (data) {
        if (data.type === 'rejected') {
          self._call(Buffer.from(data.feed, 'hex'), new Error('Purchase rejected'))
          return
        }

        if (data.type === 'approved') {
          self.market.put('buys/' + data.feed, { feed: data.feed, key: data.key })
          const feed = self._fetch(Buffer.from(data.key, 'hex'))
          feed.ready(err => self._call(Buffer.from(data.feed, 'hex'), err, feed))
          return
        }

        if (data.type === 'buy') {
          const sell = self.sales.get('sales/' + data.feed)
          sell.validate(data.data, function (err, approved) {
            if (err) return messages.destroy(err)

            if (approved) {
              const keyPair = crypto.keyPair()

              sell.data.sales.push({
                data: data.data,
                keyPair: {
                  publicKey: keyPair.publicKey.toString('hex'),
                  secretKey: keyPair.secretKey.toString('hex')
                }
              })

              self.market.put(sell.key, sell.data, function (err) {
                if (err) return messages.destroy(err)
                messages.write({
                  type: 'approved',
                  feed: data.feed,
                  key: keyPair.publicKey.toString('hex')
                })
                self._share(sell.feed, keyPair)
              })
            } else {
              messages.write({
                type: 'rejected',
                feed: data.feed
              })
            }
          })
          return
        }
      })

      for (const buy of self.buys) {
        messages.write({
          type: 'buy',
          feed: buy.feed.toString('hex'),
          data: buy.data
        })
      }
    })
  }

  _call (key, err, feed) {
    for (const buy of this.buys) {
      if (buy.feed.equals(key)) {
        const cb = buy.callback
        this.buys.splice(this.buys.indexOf(buy), 1)
        cb(err, feed)
      }
    }
  }

  buy (key, data, cb) {
    const self = this
    this.market.get('buys/' + key.toString('hex'), function (_, node) {
      if (!node) {
        self.buys.push({ feed: key, data, callback: cb })
        self.interaction.join(hypercore.discoveryKey(key))
        return
      }

      const feed = self._fetch(Buffer.from(node.value.key, 'hex'))

      feed.ready(function (err) {
        if (err) return cb(err)
        cb(null, feed)
      })
    })
  }

  sell (feed, opts, cb) {
    if (!cb) cb = noop
    if (!opts.validate) throw new Error('opts.validate is required')

    const self = this

    feed.ready(function () {
      const key = 'sales/' + feed.key.toString('hex')
      self.market.get(key, function (err, data) {
        if (err) return cb(err)

        data = data ? data.value : { feed: feed.key.toString('hex'), sales: [] },
        self.sales.set(key, {
          key,
          data,
          validate: opts.validate,
          feed
        })

        for (const sale of data.sales) {
          self._share(feed, {
            publicKey: Buffer.from(sale.keyPair.publicKey, 'hex'),
            secretKey: Buffer.from(sale.keyPair.secretKey, 'hex')
          })
        }

        self.interaction.join(feed.discoveryKey, { announce: true })
        cb(null, data)
      })
    })
  }

  _share (feed, keyPair) {
    const disc = hypercore.discoveryKey(keyPair.publicKey) 
    this._swarming.set(disc.toString('hex'), multiKey(feed, keyPair))
    this.feeds.join(disc, { announce: true })
  }

  _fetch (key) {
    const disc = hypercore.discoveryKey(key)
    const feed = hypercore(this.storage + '/buys/' + disc.toString('hex'), key)

    this._swarming.set(disc.toString('hex'), feed)
    this.feeds.join(disc)

    return feed
  }
}

function noop () {}
