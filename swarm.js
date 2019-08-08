const network = require('hyperswarm')
const pump = require('pump')
const market = require('./')

module.exports = swarm

function swarm (m, onerror, opts) {
  if (!opts) opts = {}
  const swarm = network(opts)

  swarm.on('connection', function (socket) {
    const stream = m.replicate()
    if (onerror) stream.on('error', onerror)
    pump(socket, stream, socket)
  })

  const announce = market.isSeller(m)
  const lookup = !announce

  m.ready(() => swarm.join(m.discoveryKey, { announce, lookup }))

  return swarm
}
