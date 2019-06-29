#!/usr/bin/env node
const swarm = require('../swarm')
const pump = require('pump')
const Path = require('sandbox-path')
const path = require('path')
const market = require('../market')
const raf = require('random-access-file')

const DAZAAR_PATH = process.env.DAZAAR_PATH || path.join(process.cwd(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p'],
  boolean: ['h', 'version', 'live'],
  alias: {
    h: 'help',
    p: 'path',
    l: 'live'
  },
  default: {
    p: DAZAAR_PATH,
    live: true
  }
})

if (argv.h) {
  console.info(`

Usage:	dazaar-buy [OPTIONS] KEY

Options:
  -p, --path PATH     Where to store the dazaar state, including keys.
                      Defaults to $PWD/.dazaar
  --version           Show install Dazaar version
  -h, --help          Show this message

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
const buyer = m.buy(Buffer.from(argv._[0], 'hex'))

buyer.ready(function (err) {
  if (err) throw err

  buyer.once('feed', function () {
    pump(buyer.feed.createReadStream({ live: argv.live }), process.stdout)
  })

  swarm(buyer)
})
