#!/usr/bin/env node
const swarm = require('../swarm')
const pump = require('pump')
const Path = require('sandbox-path')
const path = require('path')
const market = require('../market')
const raf = require('random-access-file')

const DAZAAR_PATH = process.env.DAZAAR_PATH || path.join(process.cwd(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p', 'c'],
  boolean: ['h', 'version', 'live'],
  alias: {
    h: 'help',
    p: 'path',
    l: 'live',
    c: 'card',
    t: 'tail'
  },
  default: {
    p: DAZAAR_PATH,
    live: true
  }
})

if (argv.h) {
  console.info(`

Usage: dazaar-fetch [OPTIONS] <KEY>

Options:
  -p, --path PATH     Where to store the dazaar state, including keys.
                      Defaults to $PWD/.dazaar
  --version           Show install Dazaar version
  -h, --help          Show this message
  --card              Optional path to the Dazaar card
                      If this is set you don't need the KEY argument
  -t, --tail          Only get and print the latest data

Arguments:
  KEY                 Hex encoded public key provided by the seller
`)
  process.exit(0)
}

if (argv.version) {
  console.info(require('../package.json').version)
  process.exit(0)
}

const spath = new Path(argv.p)
const prefixPath = prefix => f => raf(spath.resolve(prefix, f))

const m = market(prefixPath('.'))
const key = argv.card ? Buffer.from(require(path.resolve(argv.card)).id, 'hex') : Buffer.from(argv._[0], 'hex')
const buyer = m.buy(key, {
  sparse: argv.tail
})

buyer.ready(function (err) {
  if (err) throw err

  if (!argv.tail) {
    buyer.once('feed', function () {
      pump(buyer.feed.createReadStream({ live: argv.live }), process.stdout)
    })
  }

  swarm(buyer).once('connection', function (_, info) {
    if (!argv.tail) return

    setTimeout(function () { // give the connnection a little time to swarm ...
      if (buyer.feed) onfeed()
      else buyer.once('feed', onfeed)
    }, 50)

    function onfeed () {
      buyer.feed.update({ ifAvailable: true }, function () {
        const start = Math.max(0, buyer.feed.length - 1)
        pump(buyer.feed.createReadStream({ live: true, start }), process.stdout)
      })
    }
  })
})
