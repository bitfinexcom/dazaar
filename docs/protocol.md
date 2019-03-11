# The Dazaar Protocol

This document describes how Dazaar (https://dazaar.com) works in detail. Dazaar is a protocol and marketplace for sharing, selling, and buying various data sets through a peer to peer network. Dazaar supports any data format that can be represented using an append-only log data structure.

## Hypercores

Dazaar's core primitive is the P2P append-only log data structure named Hypercore, https://github.com/mafintosh/hypercore, which serves as the main format for storing and distributing data.

Hypercore is similar to a single-writer ledger, which does not need any
proof of work / stake, since only the creator of the ledger is able to append to it. Each entry appended to a Hypercore is addressed by a sequence number, at which it is inserted, similar to an array. To guarentee data integrity, Hypercore uses a cryptographically signed Merkle Tree. Only the content creator holds the secret key for signing new data. Using a Merkle Tree also gives efficient updates and random access. When a new item is appended to the Hypercore, the Merkle Tree is updated and the root(s) are signed.

```
# A Hypercore with 3 items appended looks like this where the first item
# is addressed by sequence number 0, then 1, then 2, and so fourth.

0: hello
1: distributed
2: world
```

The Merkle Tree "spans" the data in the following way

```
  1 <-------+
 / \        |--- Merkle Tree roots
0   2  4 <--+

h   d  w
e   i  o
l   s  r
l   t  l
o   .  d
    .
```

Appending the value "another" to the Hypercore, the Merkle Tree
grows into the following structure

```
      3 <------- Merkle Tree root
   /     \
  1       5
 / \     / \
0   2   4   6

h   d   w   a
e   i   o   n
l   s   r   o
l   t   l   t
o   .   d   .
    .       .
```

In the case of multiple Merkle roots (ie. `count(data) !== 2 ^ n`), all roots are hashed together, called a tree hash, which is then signed to construct a single Merkle proof. These loose roots are sometimes called "peaks" or "shoulders".

Signing the root of the Merkle Tree verifies the origin of the data, since a replicating peer will use the corresponding public key to verify the origin of the data, as well as the integrity. The public key acts as a distributed identifier for the Hypercore, often referred to as the "Hypercore key".

As previously mentioned, the Merkle Tree allows for efficient random access. This feature allows peers to securely download only the parts of the log, they are interested in. This property makes Hypercore ideal for time series data with live updates or sparsely replicating very large data sets.

The random access features also permits powerful data structures to be
implemented on top, which opens for much more rich applications.

Examples include:

* Random access key-value store: https://github.com/mafintosh/hypertrie
* Multi-writer key-value store: https://github.com/mafintosh/hyperdb
* Distributed file system: https://github.com/mafintosh/hyperdrive

Hypercores are also used as the foundating of the Dat protocol, and further technical details can be found in the Dat white paper: https://github.com/datprotocol/whitepaper/blob/master/dat-paper.pdf

## Distribution and access control

As mentioned above Hypercores are a peer to peer datastructure, meaning that
each person downloading a Hypercore can redistribute the data to other peers.

This is one of the hallmarks of P2P technology as it can massively help scale
data distribution without having a big centralised server take on the cost of
meeting the demand of who wants to get the data.

However, the distributed feature also requires us to think more about what and
how we implement access control systems in a P2P world. In this context, what we
mean by access control systems, is ways of controlling who can access data we
publish and ways to revoke access if a condition we set up as an access
requirement is no longer met.

Per default Hypercores ship with a very basic access control system, a
capability system. This capability system ensures using cryptographic primitives
that only peers that have received the public key of a Hypercore using some out
of band secure communication are able to replicate data from other peers in the
network.

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

Obviously for something like a distributed market place where we want to able to
sell a subscription to a data feed, and revoke access to the same data feed if a
customer is no longer paying for it we needed a better solution.

## Revokable data subscriptions

To support revokable data subscriptions on top of Hypercore we need a couple of
features that the above capability system does not provide out of the box.

1. A fully authenticated encrypted channel so a seller knows who a buyer is and
vice versa, so that trust can be established that a buyer actually bought the
data and is not pretending to be someone else. 2. A way to revoke access to a
Hypercore so that once a buyer stops paying for a subscription we have a way to
stop sharing data with them in the future.

Given these features we can establish a market place where a buyer identifies a
data stream they want to purchase from a seller.

Using an encrypted channel they would establish a P2P connection between each
other and establish that the buyer has indeed purchased a subscription for the
data using some proof of payment. Since they are using an authenticated
connection the buyer should be able to trust that the seller is indeed the owner
of the dataset and a scammer trying to push bad data. Periodically the seller
will check that the buyer's subscription is still valid and if that is no longer
the case the buyer will revoke access to the data stream.

## 1. Fully authenticated connections

To establish fully authenticated connections between a buyer and seller dazaar
uses the Noise protocol framework. For those unfamiliar with Noise it is like a
highly modular and modern set of cryptography patters, based on Diffie-Hellman
key exhange that allows you build encrypted tunnels between users satisfying
exactly the requirements you need.

Establishing secure handshakes is a highly complex operation and has been the
subject of many years of research and many scientific papers.

From an implementors point of view, Noise is good to work with due to the fact
that the way the peers are validated is highly pluggable. For example if we were
to look at something like SSL for a second, that is very much configured out of
the box to work with a classic client-server model, like we have in a web
browser. An unauthenticated client connects to an untrusted server, they
exchange some messages and at some point after a Diffie-Hellman exchange has
happened the client needs to validate that the server is indeed the server it
was looking for and not some scammer in the middle. The way that is done here is
by checking that the servers keys are signed by a trusted third party, the SSL
certificate issuer. This is a fine model for the web, but hard to fit in a peer
to peer scenario where we don't really have trusted third parties in the same
way we do in a web browser.

For our market place our authentication model using Noise works like this:

1. A data seller is identified by a cryptographic public key (S). This public
key is pre-shared with potential data buyers through some secure medium, such as
posting in on a personal website or sending it through a secure messaging app
such as Signal. The corresponding secret key is known only to the data seller
and kept secure and private. 2. A data buyer is also identified by a
cryptographic public (B) but this key is not pre-shared with the data seller.

To purchase a data subscription the buyer provides payment using a payment
method the seller has pre-shared. For example if they were to pay using a crypto
currency they'd include their public key (S) in the transaction comment that is
submitted to the corresponding block chain.

The buyer then connects to the seller. To find each other they use a distributed
discovery service (described below in the Discovery section). The seller
announces their IP address under their public key (B) which the buyer uses to
find the seller and the two peers establish a network connection between each
other.

To establish the fully authenticated and encrypted connection the peers now use
the Noise protocol framework using the XK pattern. The XK pattern is used when
we have a preshared public for one of the peers, in our case the seller (S). The
Noise protocol then takes care of doing a Diffie-Hellman exchange, and at some
point in the handshake it requires the seller to validate other persons public
key, in our case the buyer (B). To validate the buyers public key, the seller
should verifiy that this public key (B), indeed is written in a block chain
transaction, paying for the data subscription or using whatever prenegotiated
way of payment. If this public is indeed used in a valid and current transaction
the seller will accept this public key and the two peers now have a fully
encrypted and authenticated channel between each other. Note that it is not
possible for a third party to fake having the buyers public key (B) as the Noise
handshake makes sure using Diffie-Hellman that the buyer has the corresponding
private key as well.

Periodically the seller should revalidate that the buyers public key is present
in an up-to-date transaction and if that is no longer the case revoke the data
stream and disconnect from the buyer.

We should note that to revoke a key pair used by a buyer to connect to a seller,
one should simply stop providing a payment proof for this key pair. It should
also be noted that it is the sellers responsibility to ensure that it is not
connected to multiple buyers using the same key pair.

## 2. Revokable Hypercores

Using the scheme described above we can bootstrap a network, where the
authentication layer for each encrypted connection is based on a "proof of
payment" instead of a federated certification chain like in SSL.

In the situation where we want to revoke access to the data stored in the
Hypercore, for example in case the proof of payment has expired, or if the buyer
has broken usage terms that the seller has provided, we need to some additional
tweaks.

If we recall from earlier in this document, Hypercores by themself do not have a
per user revocation scheme build in. If you share a Hypercore with peers A and
B, there is nothing stopping peer A from continue to share it with B, if you cut
off access to peer B.

For a market place we obviously want better mechanics for this. To provide this
we introduce a concept of "re-keyed" Hypercores. A re-keyed Hypercore is a
Hypercore that share the data and Merkle Tree with another Hypercore, but its
Merkle root is signed by a different key pair which makes it look like a
different data set on the network.

If we look at the technical drawing for a Hypercore with 4 pieces of data in the
beginning of this paper

```
      3   <--- Merkle Tree root
   /    \
  1      5
 / \    / \
0   2  4   6
```

To re-key a Hypercore like this, we simply generate a new key pair and re-sign
the Merkle Tree root at `3`. In the worst case there will only ever be
`log2(count(data))` Merkle Tree roots, making this operation efficent. We don't
need to store any of these signatures on disk as they can simply be generated on
demand when a peer requests a new signature for an updated Merkle tree. This
means that a re-keyed Hypercore requires zero additional storage except that we
need to persist the key pair used to generate the signature.

Directly two re-keyed Hypercores cannot swarm with each other.

```
# Non re-keyed replication:
# A is a hypercore and B and C are peers replicating

   A
 /   \
B --- C

# If A stops replicating with C, B can still forward the data and C can still
# verify it.

   A
 /
B --- C

# Re-keyed replication:
# A is a hypercore and B is a re-keyed Hypercore based on A
# and C is a re-keyed Hypercore based on A

   A
 /   \
B     C

# In this case B and C cannot swarm directly as the two Hypercores
# are not equal (ie uses different key pairs)
```

It should be noted that if B and C in the scenario choses to replicate anyway,
their Merkle Trees will be equivalent, but their tree signatures will not. This
means that C could in theory get old data from B as long as it receives the
signatures from A for the corresponding Merkle Tree root.

To revoke access to a re-keyed Hypercore a seller should simply stop sharing the
re-keyed Hypercore. In addition to avoid the revoked buyer re-sharing the re-
keyed Hypercore, it can choose to make public the key pair used to sign the
Merkle Tree. By publisizing it, the key pair can no longer be trusted to only
have been used by the seller, making it non trust worthy. In this case the buyer
can still re-share the data, but would have to sign it with a key pair the buyer
generates by themself, invalidating that the data actually came from the seller.

## Discovery

To bootstrap a P2P system we usually need a way for two peers to find each
other. Since we are dealing with a networked system a peer address boils down to
an IP where their computer is located and a TCP/UDP port they are listening for
traffic on. However two peers seldomly know others addresses up front.

Instead, usually, a key or topic is shared instead describing a group of peers
in the P2P system. In systems like BitTorrent, this key is called the info hash,
or magnet link and in Hypercore we call this key the "Hypercore Discovery Key",
but it tends to just be some preshared information that allow peers, without
trusting eachother, to get an idea of wheather they are interested in the same
data.

In a centralised system, the way we normally map from a key -> IP:port is by
purchasing a DNS record for the key and publishing the IP to a series of DNS
servers. This method does not scale particulary well to P2P systems, DNS servers
are built for much more permanent addresses than peers in a P2P system has.

Therefore P2P systems tend to use a different systems.

In Dazaar we used a discovery system called a Distributed Hash Table or DHT for
short. A DHT is a data structure that efficiently allows peers to share
key->value data withother by having each peer store a tiny portion of the
overall data, whilst using a routing mechanism that allows you to find which
peer is sharing what data without having to talk to many differnent peers
(usually only `log(n)` peers).

Dazaar uses a DHT based on Kademlia paper,
https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf called the
HyperSwarm DHT, https://github.com/hyperswarm/dht

Additionaly to support offline discovery multicast DNS is used on the local
network a peer is connected to, to find other peers in our topic.

## Hole punching and P2P connectivity

One of the main features of the HyperSwarm DHT is that it solves another hard
problem in regards to P2P discovery and connectivity, something called UDP hole
punching.

UDP hole punching is a mechanism where two peers behind a firewall can use a
third peer that they both can connect to through their firewall, to exchange a
series of messages that allow them to connect directly to eachother.

Without UDP hole punching the chances of a P2P connection succeding on home
network are usually low, as most routers today reject incoming inconnections.
UDP hole punching by it self is also not guaranteed to make connectivity work
but it greatly increases the chances.

Normally hole punching is done through a central pre-shared server. For example
this is how WebRTC in a WebBrowser does hole punching, in many cases using
Google's free central hole puncher.

In the HyperSwarm DHT we use DHT peers instead of relying on a central hole
puncher.

Although more complex than using a central server, this has a couple of
advantages.

* It is less reliant on centralised peers.
* Less metadata is leaked to a third party (i.e. who is connecting to who).
* Having hole punching built in to a DHT means more peers can join the DHT.

If peer A wants to connect to peer B, then the DHT peer, C, storing the
information about B's IP and port will be able to act as a hole punching peer.
This follows because B was able to access C to store its IP and port and A want
able to access C because it was able to retrieve the IP and port from C as well.

## Dazaar Card

To easier distribute the payment terms and other metadata for the data set you
want to share on Dazaar in a structured way, we introduce the "Dazaar Card", a
JSON object describing your data set and terms.

A Dazaard card looks like this:

```json
{
  "name": "Dazaar card example",
  "description": "Highly valuable market data",
  "homepage": "https://example.com",
  "contact": "janedoe@example.com",
  "provider": "Jane Doe",
  "sellerKey": "dead...beef",
  "payment": [{
    "method": "ETH",
    "currency": "ETH",
    "unit": "seconds",
    "interval": "600",
    "amount": "0.01",
    "payTo": "0x61b9898c9b60a159fc91ae8026563cd226b7a0c1"
  }]
}
```

The above Dazaar card describes a data set of "Highly valuable market data",
that can be purchased using an Ethereum payment of `0.01` every 600 seconds to
the specified address.

## Buying and selling protocol using Dazaar

We use the above data structures and techniques to construct the Dazaar market
place for data.

### Selling data

It functions like this. Assume a seller, S wants to sell a data set stored in a
Hypercore, HC.

If S has not already they generate a cryptographic key pair to be used as their
identity. This key pair is persisted using any form of secure storage (i.e.
stored encrypted backed back a strong passphrase).

S then announces their IP and port on the HyperSwarm DHT under their public key
and publishes their public key on a web site or some distributed table together
with a human readable description off the data set they are selling, along with
details of price, how to pay, terms etc, in the form of a Dazaar card (described
above).

### Buying data

Now a buyer B, discovers the data set listing for HC and wants to purchase it.

Like S, B generates and persists a key pair.

Then, based on the terms that S listed, B does an initial payment for the data
and when doing so attaches their public key to the payment.

B then connects to S. Like mentioned in the authenticated connections section
above, S validates B's public key by checking that B's public key is present in
a recent payment to S.

If so, S generates a re-keyed Hypercore, HC', from HC and forwards the Hypercore
key of HC' to B. If B has previously contacted S, then it should not make a new
re-keyed Hypercore but instead re-use the keypair from the previous interaction,
so that B does not have to redownload the full data set again.

It sends back the key of HC' using by sending the following Protocol Buffers
schema

```proto
message Receipt {
  optional bytes reKeyedFeed = 1;
  optional string invalid = 2;
}
```

In case it rejects B's public key, it can set the `invalid` string in the
Receipt message to contain the reason why it rejected it.

After sending the Receipt message, the rest of the encrypted channel between S
and B, is used to replicate the re-keyed Hypercore using the Hypercore
replication protocol.

Periodically S will verify that B's public is still in a recent transaction to S
based on the terms. If not S should terminate the connection to B.

## Conclusion

Dazaar is new protocol for sharing, selling and buying data using a fully
distributed network without middlemen and payment fees involved.

This paper describes the initial functional prototype of the system.

We are eager to get feedback on the system as we iterate the various aspects of
it.
