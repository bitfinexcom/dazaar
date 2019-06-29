#!/usr/bin/env node
const hypercore = require('hypercore')
const swarm = require('../swarm')
const pump = require('pump')
const Path = require('sandbox-path')
const market = require('../market')
const raf = require('random-access-file')

const DAZAAR_PATH = process.env.DAZAAR_PATH || require('path').join(process.cwd(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p'],
  boolean: ['h', 'version'],
  alias: {
    f: 'feed',
    h: 'help',
    p: 'path'
  },
  default: {
    p: DAZAAR_PATH
  }
})

if (argv.h) {
  console.info(`

Usage:	dazaar-sell [OPTIONS] [FEED]

Options:
  -p, --path PATH     Where to store the dazaar state, including keys.
                      Defaults to $PWD/.dazaar
  -f, --force         Overwrite existing key files
  --version           Show install Dazaar version
  -h, --help          Show this message

Arguments:
  FEED                Path to directory of SLEEP files (hypercore). Defaults
                      to creating a new feed from stdin
`)
  process.exit(0)
}

if (argv.version) {
  console.info(require('../package.json').version)
  process.exit(0)
}

const path = new Path(argv.p)
const prefixPath = prefix => f => raf(path.resolve(prefix, f))

const existingFeed = argv._[0]
const m = market(prefixPath('.'))
const feed = hypercore(existingFeed || prefixPath('data'))

feed.ready(function (err) {
  if (err) throw err

  if (existingFeed == null) pump(process.stdin, feed.createWriteStream())

  const seller = m.sell(feed, {
    validate: function (key, cb) {
      return cb()
    }
  })

  seller.ready(function (err) {
    if (err) throw err

    console.log(seller.key.toString('hex'))

    swarm(seller)
  })
})
