import chai, { expect } from 'chai'
import { Contract, Wallet, providers } from 'ethers'
import { solidity, deployContract } from 'ethereum-waffle'

import Shard from '../build/Shard.json'

import { DELAY } from './utils'

chai.use(solidity)

interface ShardFixture {
  shard: Contract
}

export async function shardFixture(
  [wallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<ShardFixture> {
  // deploy Shard, sending the total supply to the deployer
  const { timestamp: now } = await provider.getBlock('latest')
  const shard = await deployContract(wallet, Shard, [wallet.address, wallet.address, now + 60 * 60])

  return { shard }
}
