#!/usr/bin/env node
const hypercore = require('hypercore')
const swarm = require('../swarm')
const pump = require('pump')
const Path = require('sandbox-path')
const market = require('../market')
const raf = require('random-access-file')
let eos = null

const DAZAAR_PATH = process.env.DAZAAR_PATH || require('path').join(process.cwd(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p', 'c'],
  boolean: ['h', 'version', 'free'],
  alias: {
    f: 'feed',
    h: 'help',
    p: 'path',
    c: 'card',
    v: 'version'
  },
  default: {
    p: DAZAAR_PATH
  }
})

if (argv.h) {
  console.info(`

Usage: dazaar-sell [OPTIONS] [FEED]

Options:
  -p, --path PATH     Where to store the dazaar state, including keys.
                      Defaults to $PWD/.dazaar
  -f, --force         Overwrite existing key files
  --free              Make this data available without any charge.
  -c, --card          Path to a Dazaar card describing this data.
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

const isFree = argv.free

if (!isFree && !argv.c) {
  console.error('--card <path-to-dazaar-card> or --free must be specified')
  process.exit(1)
}

const path = new Path(argv.p)
const prefixPath = prefix => f => raf(path.resolve(prefix, f))

const card = argv.c && require(require('path').resolve(argv.c))
const existingFeed = argv._[0]
const m = market(prefixPath('.'))
const feed = hypercore(existingFeed || prefixPath('data'))

const subscribers = new Map()
const pay = !isFree && [].concat(card.payment || []).filter(p => p.method === 'EOS')[0]

if (!pay && !isFree) {
  console.error('Dazaar card does not include a valid payment method')
  console.error('(At the moment only EOS is supported)')
  process.exit(1)
}

feed.ready(function (err) {
  if (err) throw err

  if (existingFeed == null) pump(process.stdin, feed.createWriteStream())

  const seller = m.sell(feed, {
    validate: function (key, cb) {
      if (isFree) return cb(null)

      const sub = tail(key)

      if (sub.synced) return cb(sub.active() ? null : new Error('Subscription is not active'))

      sub.on('update', onupdate)
      sub.on('synced', onsynced)

      function onupdate () {
        if (sub.active()) onsynced()
      }

      function onsynced () {
        cleanup()
        cb(sub.active() ? null : new Error('Subscription is not active'))
      }

      function cleanup () {
        sub.removeListener('update', onupdate)
        sub.removeListener('synced', onsynced)
      }
    }
  })

  seller.ready(function (err) {
    if (err) throw err

    console.log(seller.key.toString('hex'))

    swarm(seller)
  })

  function tail (buyer) {
    if (!eos) eos = require('dazaar-eos-stream')({ account: pay.payTo })

    const k = buyer.toString('hex')
    const filter = 'dazaar: ' + seller.key.toString('hex') + ' ' + k

    let sub = subscribers.get(k)

    if (!sub) {
      sub = eos.subscription(filter, pay)
      subscribers.set(k, sub)
    }

    return sub
  }
})
