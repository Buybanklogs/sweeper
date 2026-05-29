import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getSupportedChain } from "../config/chains";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

export type BackendSignerStatus = {
  enabled: boolean;
  configured: boolean;
  requiresTriggerSecret: boolean;
  address?: `0x${string}`;
};

export type BackendSignerTransaction = {
  to: `0x${string}`;
  value: bigint;
  data?: `0x${string}`;
  gas: bigint;
};

const backendSignerAccount = env.BACKEND_SIGNER_PRIVATE_KEY
  ? privateKeyToAccount(env.BACKEND_SIGNER_PRIVATE_KEY as Hex)
  : undefined;

export function getBackendSignerStatus(): BackendSignerStatus {
  return {
    enabled: env.BACKEND_SIGNER_ENABLED,
    configured: Boolean(backendSignerAccount),
    requiresTriggerSecret: Boolean(env.BACKEND_SIGNER_TRIGGER_SECRET),
    address: backendSignerAccount?.address
  };
}

export function getBackendSignerAddress(): `0x${string}` {
  if (!env.BACKEND_SIGNER_ENABLED || !backendSignerAccount) {
    throw new AppError("Backend signer is not enabled or configured", 503);
  }

  return backendSignerAccount.address;
}

export async function signAndBroadcastWithBackendSigner(
  chainId: number,
  tx: BackendSignerTransaction
): Promise<`0x${string}`> {
  if (!env.BACKEND_SIGNER_ENABLED || !backendSignerAccount) {
    throw new AppError("Backend signer is not enabled or configured", 503);
  }

  const chain = getSupportedChain(chainId);

  if (!chain) {
    throw new AppError(`Unsupported EVM chain: ${chainId}`, 400);
  }

  const walletClient = createWalletClient({
    account: backendSignerAccount,
    chain: chain.viemChain,
    transport: http(chain.rpcUrl)
  });

  return walletClient.sendTransaction({
    account: backendSignerAccount,
    chain: chain.viemChain,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gas: tx.gas
  });
}
