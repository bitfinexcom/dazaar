#!/usr/bin/env bash
const noise = require('noise-peer')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DAZAAR_PATH = process.env.DAZAAR_PATH || path.join(os.homedir(), '.dazaar')

const argv = require('minimist')(process.argv.slice(2), {
  string: ['p'],
  boolean: ['f', 'h'],
  alias: {
    f: 'force',
    h: 'help',
    p: 'path'
  },
  default: {
    p: path.join(DAZAAR_PATH, 'noise')
  }
})

if (process.h) {
  console.error(`dazaar-keygen
    -p, --path FILE     Where to store the dazaar secret key. The public key
                        will be stored at FILE.pub. Defaults to ~/.dazaar/noise
    -f, --force         Overwrite existing key files
    -h, --help          Show this message
`)
  process.exit(1)
}

fs.mkdirSync(DAZAAR_PATH, { recursive: true })

const keys = noise.keygen()

try {
  fs.writeFileSync(argv.p, keys.secretKey, {
    flag: argv.force ? 'wx' : 'wx+'
  })
  fs.writeFileSync(argv.p + '.pub', keys.publicKey, {
    flag: argv.force ? 'wx' : 'wx+'
  })
} catch (ex) {
  if (ex.code === 'EEXIST') {
    console.error('Key file ' + argv.p + ' already exist. Run with --force to overwrite')
  } else {
    console.error(ex)
  }
  process.exit(1)
}
