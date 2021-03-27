import chai, { expect } from 'chai'
import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import Vester from '../../build/Vester.json'

import { shardFixture } from '../fixtures'
import { mineBlock, expandTo18Decimals } from '../utils'

chai.use(solidity)

describe('scenario:Vester', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, other0] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let shard: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(shardFixture)
    shard = fixture.shard
  })

  let vester: Contract
  let vestingAmount: BigNumber
  let vestingBegin: number
  let vestingCliff: number
  let vestingEnd: number
  beforeEach('deploy vesting contract', async () => {
    const { timestamp: now } = await provider.getBlock('latest')
    vestingAmount = expandTo18Decimals(100)
    vestingBegin = now + 60
    vestingCliff = vestingBegin + 60
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365
    vester = await deployContract(wallet, Vester, [
      shard.address,
      other0.address,
      vestingAmount,
      vestingBegin,
      vestingCliff,
      vestingEnd,
    ])

    // fund the vester
    await shard.transfer(vester.address, vestingAmount)
  })

  it('setRecipient:fail', async () => {
    await expect(vester.setRecipient(wallet.address)).to.be.revertedWith(
      'Vester::setRecipient: unauthorized'
    )
  })

  it('claim:fail', async () => {
    await expect(vester.claim()).to.be.revertedWith('Vester::claim: not time yet')
    await mineBlock(provider, vestingBegin + 1)
    await expect(vester.claim()).to.be.revertedWith('Vester::claim: not time yet')
  })

  it('claim:~half', async () => {
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await vester.claim()
    const balance = await shard.balanceOf(other0.address)
    expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
  })

  it('claim:all', async () => {
    await mineBlock(provider, vestingEnd)
    await vester.claim()
    const balance = await shard.balanceOf(other0.address)
    expect(balance).to.be.eq(vestingAmount)
  })
})
