
const hyperswarm = require('hyperswarm')

const a = hyperswarm({
  announceLocalAddress: true
})
const b = hyperswarm({
  announceLocalAddress: true
})

const topic = Buffer.alloc(32).fill('testing-' + Date.now())

b.on('peer', function (peer) {
  console.log('got peer: ' + peer.host + ':' + peer.port + ' (local? ' + peer.local + ')')
})

a.on('connection', function () {
  console.log('a connection')
})

b.on('connection', function () {
  console.log('b connection')
})

a.join(topic, { announce: true })
a.once('updated', function () {
  console.log('updated')
  b.join(topic, { lookup: true })
})
