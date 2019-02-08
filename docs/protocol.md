# The Dazaar Protocol

This document tries to lay out how Dazaar works on an overall
technical level. Dazaar is a protocol and marketplace for sharing,
selling, and buying various time series data sets over a peer to peer
network. When we talk about time series data, we mean any kind of data
that can be represented using an append-only log data structure.

## Hypercores

In Dazaar we use the P2P append-only log data structure called Hypercore,
https://github.com/mafintosh/hypercore as the main format for storing and
distributing data.

Hypercores are similar to a single writer blockchain, that does not need
any proof of work / stake, since only the creator of the chain is be able 
to write to it. Every entry appended to a Hypercore is addressed by the index
at which it is inserted, similar to a simple array. To ensure content
integrity when the Hypercores are replicated they have an integrated Merkle
Tree that is used to make sure only the data added by the original creator
is distributed. When a new item is inserted into the Hypercore, the Merkle
Tree is updated and then signed by a cryptographic keypair that only the creator
has access to.

```
# A Hypercore with 3 items appended looks like this where the first item
# is addressed by index 0, then 1, then 2, and so fourth.

0: hello
1: distributed
2: world
```

In addition it has advanced "random access" features that allows peers to
securely download only the parts of the log, they are interested in.

Due to it's append-only structure and distributed nature Hypercore are a
great choice for any kind of pure time series data you would want to distribute
online.

However the random access features, also allow powerful data structures to be
implemented on top that allows much more complex applications.

Examples of these include:

* Random access key value stores using hash array mapped tries, https://github.com/mafintosh/hypertrie
* Multi writer key value stores, https://github.com/mafintosh/hyperdb
* Distributed file systems, https://github.com/mafintosh/hyperdrive

And many more.
