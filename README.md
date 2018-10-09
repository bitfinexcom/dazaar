# hypermarket

Share hypercores on a one to one basis like a marketplace

```
npm install hypermarket
```

## Usage

First setup a seller

```js
const market = require('hypermarket')

const m = market('./seller')

m.sell(someFeed, {
  validate (from, cb) {
    console.log(from.data)
    cb(null, true)
  }
})
```

Then to buy a feed

```js
const m = market('./buyer')

// if you already bought this, it'll just call the callback
// right away with your previous purchase
m.buy(someKey, { metadata }, function (err, feed) {
  
})
```

## License

MIT
