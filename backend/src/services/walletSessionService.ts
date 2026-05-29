import { CONSENT_TEXT } from "../config/constants";
import { getSupportedChain } from "../config/chains";
import { prisma } from "../db/prisma";
import { normalizeAddress } from "../utils/address";
import { AppError } from "../utils/errors";

export type WalletSessionInput = {
  walletAddress: string;
  connector: string;
  chains: number[];
  consentGranted: boolean;
  consentText: string;
};

function normalizeChains(chains: number[]): number[] {
  const unique = [...new Set(chains.map(Number))].filter((chainId) => getSupportedChain(chainId));

  if (unique.length === 0) {
    throw new AppError("At least one supported EVM chain is required", 400);
  }

  return unique;
}

export async function recordWalletSession(input: WalletSessionInput) {
  if (!input.consentGranted || input.consentText !== CONSENT_TEXT) {
    throw new AppError("Explicit wallet interaction consent is required before connection", 400);
  }

  const walletAddress = normalizeAddress(input.walletAddress);
  const chains = normalizeChains(input.chains);

  await prisma.user.upsert({
    where: { walletAddress },
    update: { consentGranted: true },
    create: {
      walletAddress,
      consentGranted: true
    }
  });

  return prisma.walletSession.create({
    data: {
      walletAddress,
      connector: input.connector,
      chains,
      consentText: input.consentText,
      status: "CONNECTED"
    }
  });
}
