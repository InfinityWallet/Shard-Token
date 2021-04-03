import chai, { expect } from 'chai'
import { BigNumber, Contract, constants, utils } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { shardFixture } from './fixtures'
import { expandTo18Decimals, mineBlock } from './utils'

import Shard from '../build/Shard.json'

chai.use(solidity)

const DOMAIN_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
)

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

const TRANSFER_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('Transfer(address to,uint256 value,uint256 nonce,uint256 expiry)')
)

const TRANSFER_WITH_FEE_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('TransferWithFee(address to,uint256 value,uint256 fee,uint256 nonce,uint256 expiry)')
)

describe('Shard', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, other0, other1] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let shard: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(shardFixture)
    shard = fixture.shard
  })

  it('permit', async () => {
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes('Shard')), 1, shard.address]
      )
    )

    const owner = wallet.address
    const spender = other0.address
    const value = 123
    const nonce = await shard.nonces(wallet.address)
    const deadline = constants.MaxUint256
    const digest = utils.keccak256(
      utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
              [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
            )
          ),
        ]
      )
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await shard.permit(owner, spender, value, deadline, v, utils.hexlify(r), utils.hexlify(s))
    expect(await shard.allowance(owner, spender)).to.eq(value)
    expect(await shard.nonces(owner)).to.eq(1)

    await shard.connect(other0).transferFrom(owner, spender, value)
  })

  it('transferBySig', async () => {
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes('Shard')), 1, shard.address]
      )
    )

    const signatory = wallet.address
    const to = other0.address
    const value = 123
    const nonce = await shard.nonces(signatory)
    const expiry = constants.MaxUint256
    const digest = utils.keccak256(
      utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ['bytes32', 'address', 'uint256', 'uint256', 'uint256'],
              [TRANSFER_TYPEHASH, to, value, nonce, expiry]
            )
          ),
        ]
      )
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await shard.connect(other0).transferBySig(to, value, nonce, expiry, v, utils.hexlify(r), utils.hexlify(s))
    expect(await shard.nonces(signatory)).to.eq(1)
    expect(await shard.balanceOf(to)).to.eq(value)
  })

  it('transferWithFeeBySig', async () => {
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes('Shard')), 1, shard.address]
      )
    )

    const signatory = wallet.address
    const to = other0.address
    const value = 123
    const fee = 10
    const nonce = await shard.nonces(signatory)
    const expiry = constants.MaxUint256
    const feeTo = other1.address
    const digest = utils.keccak256(
      utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ['bytes32', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
              [TRANSFER_WITH_FEE_TYPEHASH, to, value, fee, nonce, expiry]
            )
          ),
        ]
      )
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await shard.connect(other1).transferWithFeeBySig(to, value, fee, nonce, expiry, feeTo, v, utils.hexlify(r), utils.hexlify(s))
    expect(await shard.nonces(signatory)).to.eq(1)
    expect(await shard.balanceOf(to)).to.eq(value)
    expect(await shard.balanceOf(feeTo)).to.eq(fee)
  })

  it('nested delegation', async () => {
    await shard.transfer(other0.address, expandTo18Decimals(1))
    await shard.transfer(other1.address, expandTo18Decimals(2))

    let currectVotes0 = await shard.getCurrentVotes(other0.address)
    let currectVotes1 = await shard.getCurrentVotes(other1.address)
    expect(currectVotes0).to.be.eq(0)
    expect(currectVotes1).to.be.eq(0)

    await shard.connect(other0).delegate(other1.address)
    currectVotes1 = await shard.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1))

    await shard.connect(other1).delegate(other1.address)
    currectVotes1 = await shard.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1).add(expandTo18Decimals(2)))

    await shard.connect(other1).delegate(wallet.address)
    currectVotes1 = await shard.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1))
  })

  it('mints', async () => {
    const { timestamp: now } = await provider.getBlock('latest')
    const shard = await deployContract(wallet, Shard, [wallet.address, wallet.address, now + 60 * 60])
    const supply = await shard.totalSupply()

    await expect(shard.mint(wallet.address, 1)).to.be.revertedWith('Shard::mint: minting not allowed yet')

    let timestamp = await shard.mintingAllowedAfter()
    await mineBlock(provider, timestamp.toString())

    await expect(shard.connect(other1).mint(other1.address, 1)).to.be.revertedWith('Shard::mint: only the minter can mint')
    await expect(shard.mint('0x0000000000000000000000000000000000000000', 1)).to.be.revertedWith('Shard::mint: cannot transfer to the zero address')

    // can mint up to 1%
    const amount = supply.div(100)
    await shard.mint(wallet.address, amount)
    expect(await shard.balanceOf(wallet.address)).to.be.eq(supply.add(amount))

    timestamp = await shard.mintingAllowedAfter()
    await mineBlock(provider, timestamp.toString())
    // cannot mint 1% + 1
    await expect(shard.mint(wallet.address, supply.div(100).add(1))).to.be.revertedWith('Shard::mint: amount exceeds mint allowance')
  })
})
