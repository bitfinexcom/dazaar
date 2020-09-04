const network = require('hyperswarm')
const pump = require('pump')
const market = require('./')

class Event {
  constructor () {
    this.triggered = false
    this.fns = new Set()
  }

  on (fn) {
    if (this.triggered) return fn()
    this.fns.add(fn)
  }

  emit () {
    this.triggered = true
    for (const fn of this.fns) fn()
  }
}

module.exports = swarm

function swarm (m, onjoin, opts) {
  if (!opts) opts = { announceLocalAddress: true, preferredPort: 49737 }
  if (m.destroyed) throw new Error('Seller or buyer destroyed')
  const swarm = network(opts)

  const oneConnection = new Event()
  const allConnections = new Event()

  swarm.on('connection', function (socket, info) {
    if (m.destroyed) return socket.destroy(new Error('Seller or buyer destroyed'))
    const stream = m.replicate()
    stream.on('seller-id', function (sid) {
      info.deduplicate(sid)
    })
    if (opts.onerror) stream.on('error', opts.onerror)
    pump(socket, stream, socket)
  })

  const announce = market.isSeller(m)
  const lookup = !announce

  if (!announce) {
    if (m.feed) onfeed()
    m.on('feed', onfeed)
  }

  m.ready(() => {
    swarm.join(m.discoveryKey, { announce, lookup }, onjoin)
    swarm.flush(() => {
      allConnections.emit()
      oneConnection.emit()
    })
  })

  m._swarm = swarm

  return swarm

  function onfeed () {
    const feed = m.feed
    if (!feed.timeouts) return
    const { update, get } = feed.timeouts
    if (update) feed.timeouts.update = (cb) => oneConnection.on(() => update(cb))
    if (get) feed.timeouts.get = (cb) => allConnections.on(() => get(cb))
    feed.once('peer-open', oneConnection.emit.bind(oneConnection))
  }
}
