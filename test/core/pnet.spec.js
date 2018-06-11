/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const pull = require('pull-stream/pull')
const drain = require('pull-stream/sinks/drain')
const parallel = require('async/parallel')
const IpfsFactory = require('ipfsd-ctl')
const isNode = require('detect-node')
const path = require('path')
const rimraf = require('rimraf')
const IPFS = require('../../')
const writeKey = require('libp2p-pnet').generate
const once = require('once')

const expect = chai.expect
chai.use(dirtyChai)

const goDaemonSpawner = IpfsFactory.create({ type: 'go' })
const jsDaemonSpawner = IpfsFactory.create({ type: 'proc', exec: IPFS })

function isPong (pingResponse) {
  return Boolean(pingResponse && pingResponse.success && !pingResponse.text)
}

const config = {
  Bootstrap: [],
  Discovery: {
    MDNS: {
      Enabled: false
    },
    webRTCStar: {
      Enabled: false
    }
  }
}

/**
 * This test is design to test the connectivity of js and go nodes,
 * both private and public.
 */
describe('private network', function () {
  this.timeout(30 * 1000)
  const REPO_PATHS = path.resolve(__dirname, '../tmp/')

  if (!isNode) {
    return
  }

  const networkAKey = Buffer.alloc(95)
  const networkBKey = Buffer.alloc(95)
  writeKey(networkAKey)
  writeKey(networkBKey)

  const fs = require('fs')

  let goPrivateNetworkA
  let goPrivateNetworkB
  let jsPrivateNetworkA
  let jsPrivateNetworkA2
  let jsPrivateNetworkB
  let goPublicNetwork
  let jsPublicNetwork

  before('create the unstarted daemons', (done) => {
    parallel([
      (cb) => {
        goDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'go-repo-a'),
          config: config
        }, cb)
      },
      (cb) => {
        goDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'go-repo-b'),
          config: config
        }, cb)
      },
      (cb) => {
        jsDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'js-repo-a'),
          config: config
        }, cb)
      },
      (cb) => {
        jsDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'js-repo-a2'),
          config: config
        }, cb)
      },
      (cb) => {
        jsDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'js-repo-b'),
          config: config
        }, cb)
      },
      (cb) => {
        goDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'go-repo-pub'),
          config: config
        }, cb)
      },
      (cb) => {
        jsDaemonSpawner.spawn({
          disposable: false,
          repoPath: path.resolve(REPO_PATHS, 'js-repo-pub'),
          config: config
        }, cb)
      }
    ], (err, daemons) => {
      expect(err).to.not.exist()
      goPrivateNetworkA = daemons[0]
      goPrivateNetworkB = daemons[1]
      jsPrivateNetworkA = daemons[2]
      jsPrivateNetworkA2 = daemons[3]
      jsPrivateNetworkB = daemons[4]
      goPublicNetwork = daemons[5]
      jsPublicNetwork = daemons[6]
      done()
    })
  })

  before('init the repos', function (done) {
    this.timeout(60 * 1000)
    parallel([
      (cb) => goPrivateNetworkA.init(cb),
      (cb) => goPrivateNetworkB.init(cb),
      (cb) => jsPrivateNetworkA.init(cb),
      (cb) => jsPrivateNetworkA2.init(cb),
      (cb) => jsPrivateNetworkB.init(cb),
      (cb) => goPublicNetwork.init(cb),
      (cb) => jsPublicNetwork.init(cb)
    ], done)
  })

  before('add swarm keys to the repos', (done) => {
    parallel([
      (cb) => fs.writeFile(path.resolve(REPO_PATHS, 'go-repo-a/swarm.key'), networkAKey, cb),
      (cb) => fs.writeFile(path.resolve(REPO_PATHS, 'go-repo-b/swarm.key'), networkBKey, cb),
      (cb) => fs.writeFile(path.resolve(REPO_PATHS, 'js-repo-a/swarm.key'), networkAKey, cb),
      (cb) => fs.writeFile(path.resolve(REPO_PATHS, 'js-repo-a2/swarm.key'), networkAKey, cb),
      (cb) => fs.writeFile(path.resolve(REPO_PATHS, 'js-repo-b/swarm.key'), networkBKey, cb)
    ], done)
  })

  before('start the ipfs daemons', function (done) {
    this.timeout(60 * 1000)
    parallel([
      (cb) => goPrivateNetworkA.start(cb),
      (cb) => goPrivateNetworkB.start(cb),
      (cb) => jsPrivateNetworkA.start(cb),
      (cb) => jsPrivateNetworkA2.start(cb),
      (cb) => jsPrivateNetworkB.start(cb),
      (cb) => goPublicNetwork.start(cb),
      (cb) => jsPublicNetwork.start(cb)
    ], done)
  })

  const peers = {
    goPrivateNetworkA: {},
    goPrivateNetworkB: {},
    jsPrivateNetworkA: {},
    jsPrivateNetworkA2: {},
    jsPrivateNetworkB: {},
    goPublicNetwork: {},
    jsPublicNetwork: {}
  }

  before('collect the daemon ids', (done) => {
    parallel([
      (cb) => goPrivateNetworkA.api.id(cb),
      (cb) => goPrivateNetworkB.api.id(cb),
      (cb) => jsPrivateNetworkA.api.id(cb),
      (cb) => jsPrivateNetworkA2.api.id(cb),
      (cb) => jsPrivateNetworkB.api.id(cb),
      (cb) => goPublicNetwork.api.id(cb),
      (cb) => jsPublicNetwork.api.id(cb)
    ], (err, peerInfos) => {
      expect(err).to.not.exist()
      peers.goPrivateNetworkA.peerInfo = peerInfos[0]
      peers.goPrivateNetworkB.peerInfo = peerInfos[1]
      peers.jsPrivateNetworkA.peerInfo = peerInfos[2]
      peers.jsPrivateNetworkA2.peerInfo = peerInfos[3]
      peers.jsPrivateNetworkB.peerInfo = peerInfos[4]
      peers.goPublicNetwork.peerInfo = peerInfos[5]
      peers.jsPublicNetwork.peerInfo = peerInfos[6]
      done()
    })
  })

  after((done) => {
    parallel([
      (cb) => rimraf(REPO_PATHS, cb)
    ], done)
  })

  describe('two js nodes on the same network', () => {
    let targetPeerInfo

    before('connect the ipfs nodes', function (done) {
      let interval

      targetPeerInfo = peers.jsPrivateNetworkA2.peerInfo

      // Check to see if peers are already connected
      const checkConnections = () => {
        jsPrivateNetworkA.api.swarm.peers((err, peerInfos) => {
          if (err) return done(err)

          peerInfos.forEach((peerInfo) => {
            if (peerInfo.peer.toB58String() === targetPeerInfo.id) {
              clearInterval(interval)
              return done()
            }
          })
        })
      }

      parallel([
        jsPrivateNetworkA.api.swarm.connect.bind(
          jsPrivateNetworkA.api,
          targetPeerInfo.addresses[0]
        )
      ], (err) => {
        if (err) return done(err)
        interval = setInterval(checkConnections, 300)
      })
    })

    after((done) => {
      jsPrivateNetworkA.api.swarm.disconnect(targetPeerInfo.addresses[0], done)
    })

    it('should be able to talk with each other', (done) => {
      let packetNum = 0
      const count = 3

      pull(
        jsPrivateNetworkA.api.pingPullStream(targetPeerInfo.id, { count }),
        drain((res) => {
          expect(res.success).to.be.true()

          // It's a pong
          if (isPong(res)) {
            packetNum++
          }
        }, (err) => {
          expect(err).to.not.exist()
          expect(packetNum).to.equal(count)
          done()
        })
      )
    })
  })

  describe('two js nodes on different networks', () => {
    it('should timeout trying to talk with each other', function (done) {
      this.timeout(15 * 1000)
      done = once(done)

      let targetPeerInfo = peers.jsPrivateNetworkB.peerInfo

      // The connection attempt should timeout
      let timeout = setTimeout(done, 14 * 1000)

      parallel([
        (cb) => {
          jsPrivateNetworkA.api.swarm.connect(
            targetPeerInfo.addresses[0],
            cb
          )
        }
      ], (err) => {
        clearTimeout(timeout)
        expect(err).to.exist()
        done()
      })
    })
  })

  describe('a private and a public js node', () => {
    it('should timeout trying to talk with each other', (done) => {
      let targetPeerInfo = peers.jsPublicNetwork.peerInfo
      this.timeout(15 * 1000)
      done = once(done)

      // The connection attempt should timeout
      let timeout = setTimeout(done, 14 * 1000)

      parallel([
        (cb) => {
          jsPrivateNetworkA.api.swarm.connect(
            targetPeerInfo.addresses[0],
            cb
          )
        }
      ], (err) => {
        clearTimeout(timeout)
        expect(err).to.exist()
        done()
      })
    })
  })

  describe('a private js node and a public go node', () => {
    it('should NOT be able to talk with each other', (done) => {
      let targetPeerInfo = peers.goPublicNetwork.peerInfo
      this.timeout(15 * 1000)
      done = once(done)

      // The connection attempt should timeout
      let timeout = setTimeout(done, 14 * 1000)

      parallel([
        (cb) => {
          jsPrivateNetworkA.api.swarm.connect(
            targetPeerInfo.addresses[0],
            cb
          )
        }
      ], (err) => {
        clearTimeout(timeout)
        expect(err).to.exist()
        done()
      })
    })
  })

  describe('js and go on the same network', () => {
    let targetPeerInfo

    before('connect the ipfs nodes', function (done) {
      let interval

      targetPeerInfo = peers.goPrivateNetworkA.peerInfo

      // Check to see if peers are already connected
      const checkConnections = () => {
        jsPrivateNetworkA.api.swarm.peers((err, peerInfos) => {
          if (err) return done(err)

          peerInfos.forEach((peerInfo) => {
            if (peerInfo.peer.toB58String() === targetPeerInfo.id) {
              clearInterval(interval)
              return done()
            }
          })
        })
      }

      parallel([
        jsPrivateNetworkA.api.swarm.connect.bind(
          jsPrivateNetworkA.api,
          targetPeerInfo.addresses[0]
        )
      ], (err) => {
        if (err) return done(err)
        interval = setInterval(checkConnections, 300)
      })
    })

    after((done) => {
      jsPrivateNetworkA.api.swarm.disconnect(targetPeerInfo.addresses[0], done)
    })

    it('should be able to talk with each other', (done) => {
      let packetNum = 0
      const count = 3

      pull(
        jsPrivateNetworkA.api.pingPullStream(targetPeerInfo.id, { count }),
        drain((res) => {
          expect(res.success).to.be.true()

          // It's a pong
          if (isPong(res)) {
            packetNum++
          }
        }, (err) => {
          expect(err).to.not.exist()
          expect(packetNum).to.equal(count)
          done()
        })
      )
    })
  })

  describe('js and go on different networks', () => {
    it('should timeout trying to talk with each other', function (done) {
      this.timeout(15 * 1000)
      done = once(done)

      let targetPeerInfo = peers.goPrivateNetworkB.peerInfo

      // The connection attempt should timeout
      const timeout = setTimeout(done, 14 * 1000)

      parallel([
        (cb) => jsPrivateNetworkA.api.swarm.connect(
          targetPeerInfo.addresses[0],
          cb
        )
      ], (err) => {
        clearTimeout(timeout)
        expect(err).to.exist()
        done()
      })
    })
  })
})
