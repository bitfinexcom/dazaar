const network = require('@hyperswarm/network')
const pump = require('pump')
const market = require('./')

module.exports = swarm

function swarm (m, onerror) {
  const swarm = network()

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
