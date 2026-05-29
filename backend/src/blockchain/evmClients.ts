import { createPublicClient, http } from "viem";
import { ACTIVE_CHAINS, getSupportedChain } from "../config/chains";
import { AppError } from "../utils/errors";

type EvmPublicClient = {
  getBalance(args: { address: `0x${string}` }): Promise<bigint>;
  getBlockNumber(): Promise<bigint>;
};

const clients = new Map<number, EvmPublicClient>();

for (const chain of ACTIVE_CHAINS) {
  clients.set(
    chain.id,
    createPublicClient({
      chain: chain.viemChain,
      transport: http(chain.rpcUrl)
    }) as EvmPublicClient
  );
}

export function getPublicClient(chainId: number): EvmPublicClient {
  const chain = getSupportedChain(chainId);
  const client = clients.get(chainId);

  if (!chain || !client) {
    throw new AppError(`Unsupported EVM chain: ${chainId}`, 400);
  }

  return client;
}
