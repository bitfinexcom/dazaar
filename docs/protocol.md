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

The public key of the cryptographic keypair used to sign the Hypercore Merkle
Tree also acts as the distributed identifier for the Hypercore, often referred
to as "The Hypercore key".

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

## Distribution and access control

As mentioned above Hypercores are a peer to peer datastructure, meaning
that each person downloading a Hypercore can redistribute the data to other peers.

This is one of the hallmarks of P2P technology as it can massively help scale
data distribution without having a big centralised server take on the cost of meeting
the demand of who wants to get the data.

However, the distributed feature also requires us to think more about what and how
we implement access control systems in a P2P world. In this context, what we mean by
access control systems, is ways of controlling who can access data we publish and ways
to revoke access if a condition we set up as an access requirement is no longer met.

Per default Hypercores ship with a very basic access control system, a capability
system. This capability system ensures using cryptographic primitives that only
peers that have received the public key of a Hypercore using some out of band secure
communication are able to replicate data from other peers in the network.

This establishes a flow where you, a data author, can create a new Hypercore,
and using a secure channel, for example the Signal messaging app, can share the
Hypercore public key with a friend. If you and your friend now establish a P2P
network connection between each other the capability system built into Hypercore
ensures that no man in the middle will be able to decrypt the data shared in the
Hypercore itself.

This basic access control system is however quite limited. It has the power of
simplicity, since it has very little UX overhead for each party in a Hypercore
network, but lacks features such as revokation. If we had shared our Hypercore
with two different friends and now wanted to revoke one of them we would have to
stop sharing with both and create a new one - not optimal.

Obviously for something like a distributed market place where we want to able to sell
data we needed a better solution.
