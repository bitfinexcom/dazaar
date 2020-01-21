const network = require('hyperswarm')
const pump = require('pump')
const market = require('./')

module.exports = swarm

function swarm (m, onjoin, opts) {
  if (!opts) opts = { announceLocalAddress: true }
  const swarm = network(opts)

  swarm.on('connection', function (socket) {
    const stream = m.replicate()
    if (opts.onerror) stream.on('error', opts.onerror)
    pump(socket, stream, socket)
  })

  const announce = market.isSeller(m)
  const lookup = !announce

  m.ready(() => swarm.join(m.discoveryKey, { announce, lookup }, onjoin))

  return swarm
}
