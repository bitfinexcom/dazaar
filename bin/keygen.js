#!/usr/bin/env node
const Path = require('sandbox-path')
const path = require('path')
const market = require('../market')
const raf = require('random-access-file')

const DAZAAR_PATH = process.env.DAZAAR_PATH || path.join(process.cwd(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p'],
  boolean: ['f', 'h', 'version'],
  alias: {
    f: 'force',
    h: 'help',
    p: 'path',
    v: 'version'
  },
  default: {
    p: DAZAAR_PATH
  }
})

if (argv.h) {
  console.info(`

Usage: dazaar-keygen [OPTIONS]

Generate a new buyer key for adding to a given blockchain

Options:
  -p, --path PATH     Where to store the dazaar state, including keys.
                      Defaults to $PWD/.dazaar
  --version           Show install Dazaar version
  -h, --help          Show this message
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
m.ready(function (err) {
  if (err) throw err
  console.log('Buyer public key: ' + m.buyer.toString('hex'))
})
