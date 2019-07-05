#!/usr/bin/env node

const eos = require('dazaar-eos-stream')
const Path = require('sandbox-path')
const path = require('path')
const market = require('../market')
const raf = require('random-access-file')

const DAZAAR_PATH = process.env.DAZAAR_PATH || path.join(process.cwd(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p', 'a', 'k'],
  alias: {
    h: 'help',
    k: 'private-key',
    a: 'account',
    c: 'card',
    p: 'path'
  },
  default: {
    p: DAZAAR_PATH
  }
})

if (argv.h) {
  console.info(`

Usage: dazaar-buy [OPTIONS] [AMOUNT]

Options:
  -p, --path PATH     Where to store the dazaar state, including keys.
                      Defaults to $PWD/.dazaar
  --version           Show install Dazaar version
  -h, --help          Show this message
  -k, --private-key   Your EOS private key
  -a, --account       Your EOS account
  -c, --card          Path to the Dazaar card you want to purchase

Arguments:
  AMOUNT              How much do you want to pay? Fx '1.2000 EOS'
`)
  process.exit(0)
}

const AMOUNT = argv._[0]
const spath = new Path(argv.p)
const prefixPath = prefix => f => raf(spath.resolve(prefix, f))

if (argv.version) {
  console.info(require('../package.json').version)
  process.exit(0)
}
if (!argv.k) {
  console.error('--private-key is required')
  process.exit(1)
}
if (!argv.a) {
  console.error('--account is required')
  process.exit(1)
}
if (!AMOUNT) {
  console.error('You must specify amount')
  process.exit(1)
}

const m = market(prefixPath('.'))

const card = require(path.resolve(argv.card))

const { pay } = eos({
  account: argv.a,
  privateKey: argv.k,
  permission: argv.permission
})

m.ready(function (err) {
  if (err) throw err

  const payments = [].concat(card.payment || [])

  if (!payments.some(payEOS)) {
    console.log('dazaar-buy only supports EOS at the moment')
    process.exit(2)
  }

  function payEOS (p) {
    if (p.method !== 'EOS') return false

    pay(p.payTo, AMOUNT, 'dazaar: ' + card.id + ' ' + m.buyer.toString('hex'), function (err) {
      if (err) throw err

      console.log('Your payment of ' + AMOUNT + ' to ' + p.payTo + ' has been finalised')
      console.log('Try fetching ' + card.id)
    })

    return true
  }
})
