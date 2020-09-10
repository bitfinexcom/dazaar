const network = require('hyperswarm')
const pump = require('pump')
const market = require('./')

module.exports = swarm

function swarm (m, onjoin, opts) {
  if (!opts) opts = { announceLocalAddress: true }
  if (m.destroyed) throw new Error('Seller or buyer destroyed')
  const swarm = network(opts)

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

  m.ready(() => {
    if (announce && !m.uniqueFeed) swarm.join(m.feed.discoveryKey, { announce, lookup })
    swarm.join(m.discoveryKey, { announce, lookup }, onjoin)
  })
  m._swarm = swarm

  return swarm
}
