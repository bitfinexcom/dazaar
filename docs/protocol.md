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
a subscription to a data feed, and revoke access to the same data feed if a customer
is no longer paying for it we needed a better solution.

## Revokable data subscriptions

To support revokable data subscriptions on top of Hypercore we need a couple of features
that the above capability system does not provide out of the box.

1. A fully authenticated encrypted channel so a seller knows who a buyer is and
vice versa, so that trust can be established that a buyer actually bought the data and
is not pretending to be someone else.
2. A way to revoke access to a Hypercore so that once a buyer stops paying for a
subscription we have a way to stop sharing data with them in the future.

Given these features we can establish a market place where a buyer identifies
a data stream they want to purchase from a seller.

Using an encrypted channel they would establish a P2P connection between each other and
establish that the buyer has indeed purchased a subscription for the data using some proof
of payment. Since they are using an authenticated connection the buyer should be able to
trust that the seller is indeed the owner of the dataset and a scammer trying to push bad data.
Periodically the seller will check that the buyer's subscription is still valid and if
that is no longer the case the buyer will revoke access to the data stream.

## 1. Fully authenticated connections

To establish fully authenticated connections between a buyer and seller dazaar uses
the Noise protocol framework. For those unfamiliar with Noise it is like a highly modular
and modern set of cryptography patters, based on Diffie-Hellman key exhange that allows
you build encrypted tunnels between users satisfying exactly the requirements you need.

Establishing secure handshakes is a highly complex operation and has been the subject of
many years of research and many scientific papers.

From an implementors point of view, Noise is good to work with due to the fact that the
way the peers are validated is highly pluggable. For example if we were to look at something
like SSL for a second, that is very much configured out of the box to work with a classic
client-server model, like we have in a web browser.
An unauthenticated client connects to an untrusted server, they exchange some messages
and at some point after a Diffie-Hellman exchange has happened the client needs to validate
that the server is indeed the server it was looking for and not some scammer in the middle.
The way that is done here is by checking that the servers keys are signed by a trusted third
party, the SSL certificate issuer.
This is a fine model for the web, but hard to fit in a peer to peer scenario where we don't
really have trusted third parties in the same way we do in a web browser.

For our market place our authentication model using Noise works like this:

1. A data seller is identified by a cryptographic public key (S). This public key is pre-shared
with potential data buyers through some secure medium, such as posting in on a personal website
or sending it through a secure messaging app such as Signal. The corresponding secret key
is known only to the data seller and kept secure and private.
2. A data buyer is also identified by a cryptographic public (B) but this key is not
pre-shared with the data buyer.

To purchase a data subscription the buyer provides payment using a payment method the seller
has pre-shared. For example if they were to pay using a crypto currency they'd include their
public key (S) in the transaction comment that is submitted to the corresponding block chain.

The seller then connects to the buyer. To find each other they used the same DHT used by Hypercore
to find and announce peers.
The buyer announces their IP address under their public key (B) which the seller uses to find
the buyer and the two peers establish a network connection between each other.

To establish the fully authenticated and encrypted connection the peers now use the Noise
protocol framework using the XK pattern. The XK pattern is used when we have a preshared public
for one of the peers, in our case the seller (S). The Noise protocol then takes care of doing
a Diffie-Hellman exchange, and at some point in the handshake it requires the seller to validate
other persons public key, in our case the buyer (B).
To validate the buyers public key, the seller should verifiy that this public key (B), indeed
is written in a block chain transaction, paying for the data subscription or using whatever
prenegotiated way of payment. If this public is indeed used in a valid and current transaction
the seller will accept this public key and the two peers now have a fully encrypted and authenticated
channel between each other. Note that it is not possible for a third party to fake having the
buyers public key (B) as the Noise handshake makes sure using Diffie-Hellman that the buyer
has the corresponding private key as well.

Periodically the seller should revalidate that the buyers public key is present in an up-to-date
transaction and if that is no longer the case revoke the data stream and disconnect from the
buyer.

## 2. Revokable Hypercores
