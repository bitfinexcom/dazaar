#!/usr/bin/env node

const Payment = require('dazaar-payment')
const Scatter = require('dazaar-scatter-pay')
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
    p: 'path',
    v: 'version'
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

If no private-key is provided Scatter will be used to perform the transaction
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
if (!argv.c) {
  console.log('--card is required')
  process.exit(1)
}
if (!AMOUNT) {
  console.error('You must specify amount')
  process.exit(1)
}
if (!argv.k) {
  console.error('Using Scatter to perform the payment as no private key is passed')
}
if (!argv.a && argv.k) {
  console.error('--account is required')
  process.exit(1)
}

const m = market(prefixPath('.'))
const card = require(path.resolve(argv.card))

const sellerKey = Buffer.from(card.id, 'hex')

m.ready(function (err) {
  if (err) throw err

  const payments = [].concat(card.payment || [])
  const pay = argv.k ? new Payment(sellerKey, payments) : new Scatter(payments, sellerKey)
  const provider = pay.providers.find(x => x)

  if (!provider) {
    console.error('Payments not supported')
    process.exit(2)
  }

  if (argv.k) provider.buy(m.buyer, AMOUNT, { account: argv.a, privateKey: argv.k, permission: argv.permission }, done)
  else provider.buy(m.buyer, AMOUNT, done)

  function done (err) {
    if (err) throw err
    console.log('Your payment of ' + AMOUNT + ' to ' + sellerKey.toString('hex') + ' has been finalised')
    console.log('Try fetching ' + sellerKey.toString('hex'))
    process.exit(0)
  }
})
