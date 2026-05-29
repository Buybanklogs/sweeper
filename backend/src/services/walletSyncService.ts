import { formatEther } from "viem";
import { getPublicClient } from "../blockchain/evmClients";
import { ACTIVE_CHAINS, getSupportedChain } from "../config/chains";
import { prisma } from "../db/prisma";
import { normalizeAddress } from "../utils/address";
import { AppError } from "../utils/errors";
import { withRetry } from "../utils/retry";

export type ChainSyncResult = {
  chainId: number;
  chainName: string;
  symbol: string;
  balanceWei: string;
  balanceFormatted: string;
  blockNumber: string;
};

export type WalletSyncResult = {
  walletAddress: string;
  chains: ChainSyncResult[];
};

function normalizeRequestedChains(chainIds?: number[]): number[] {
  if (!chainIds || chainIds.length === 0) {
    return ACTIVE_CHAINS.map((chain) => chain.id);
  }

  const unique = [...new Set(chainIds.map(Number))];
  const supported = unique.filter((chainId) => getSupportedChain(chainId));

  if (supported.length === 0) {
    throw new AppError("No supported EVM chains requested", 400);
  }

  return supported;
}

export async function syncWallet(walletAddressInput: string, chainIds?: number[]): Promise<WalletSyncResult> {
  const walletAddress = normalizeAddress(walletAddressInput);
  const requestedChains = normalizeRequestedChains(chainIds);

  const chains = await Promise.all(
    requestedChains.map(async (chainId) => {
      const chain = getSupportedChain(chainId);
      if (!chain) {
        throw new AppError(`Unsupported EVM chain: ${chainId}`, 400);
      }

      const client = getPublicClient(chainId);
      const [balanceWei, blockNumber] = await withRetry(() =>
        Promise.all([
          client.getBalance({ address: walletAddress as `0x${string}` }),
          client.getBlockNumber()
        ])
      );

      await prisma.chainBalance.upsert({
        where: {
          walletAddress_chainId: {
            walletAddress,
            chainId
          }
        },
        update: {
          balanceWei: balanceWei.toString(),
          blockNumber: blockNumber.toString(),
          symbol: chain.symbol
        },
        create: {
          walletAddress,
          chainId,
          symbol: chain.symbol,
          balanceWei: balanceWei.toString(),
          blockNumber: blockNumber.toString()
        }
      });

      return {
        chainId,
        chainName: chain.name,
        symbol: chain.symbol,
        balanceWei: balanceWei.toString(),
        balanceFormatted: formatEther(balanceWei),
        blockNumber: blockNumber.toString()
      };
    })
  );

  await prisma.automationEvent.create({
    data: {
      walletAddress,
      eventType: "WALLET_SYNC",
      status: "SUCCESS",
      metadata: { chainIds: requestedChains }
    }
  });

  return {
    walletAddress,
    chains
  };
}
