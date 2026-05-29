import { encodeFunctionData, erc20Abi, formatEther, formatUnits, getAddress, isHash, toHex } from "viem";
import { getBackendSignerAddress, signAndBroadcastWithBackendSigner } from "../blockchain/backendSigner";
import { getPublicClient } from "../blockchain/evmClients";
import { readErc20Balance, readErc20Metadata } from "../blockchain/erc20";
import { getSupportedChain } from "../config/chains";
import { TREASURY_EVM_ADDRESS, assertTreasuryAddress } from "../config/treasury";
import { prisma } from "../db/prisma";
import { normalizeAddress } from "../utils/address";
import { AppError } from "../utils/errors";
import { withRetry } from "../utils/retry";

export type TransferAssetType = "native" | "erc20";
export type TransferExecutionMode = "WALLET_APPROVAL" | "BACKEND_SIGNER";

export type PrepareTransferInput = {
  walletAddress: string;
  chainId: number;
  assetType: TransferAssetType;
  amountRaw: string;
  tokenAddress?: string;
};

export type ExecuteTransferInput = {
  transferId: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
};

export type AutoSignTransferInput = Omit<PrepareTransferInput, "walletAddress">;

export type PreparedTransfer = {
  transferId: string;
  walletAddress: string;
  chainId: number;
  chainName: string;
  assetType: TransferAssetType;
  tokenAddress?: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amountRaw: string;
  amountFormatted: string;
  treasuryAddress: string;
  gasEstimate: string;
  gasPriceWei: string;
  estimatedNetworkFeeWei: string;
  estimatedNetworkFeeFormatted: string;
  allowanceRequired: boolean;
  executionMode: TransferExecutionMode;
  txRequest: {
    from: string;
    to: string;
    value: `0x${string}`;
    data?: `0x${string}`;
    gas: `0x${string}`;
    chainId: `0x${string}`;
  };
};

export type AutoSignedTransfer = PreparedTransfer & {
  txHash: string;
  status: string;
};

function parsePositiveAmount(amountRaw: string): bigint {
  if (!/^[0-9]+$/.test(amountRaw)) {
    throw new AppError("amountRaw must be a positive base-unit integer string", 400);
  }

  const amount = BigInt(amountRaw);

  if (amount <= 0n) {
    throw new AppError("Transfer amount must be greater than zero", 400);
  }

  return amount;
}

async function assertConnectedSession(walletAddress: string, chainId: number) {
  const session = await prisma.walletSession.findFirst({
    where: {
      walletAddress,
      status: "CONNECTED",
      chains: { has: chainId }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!session) {
    throw new AppError("No connected WalletConnect session found for this wallet and chain", 403);
  }

  return session;
}

async function persistPreparedTransfer(params: {
  walletAddress: string;
  chainId: number;
  assetType: TransferAssetType;
  tokenAddress?: string;
  tokenSymbol: string;
  amountRaw: bigint;
  gasEstimate: bigint;
  gasPriceWei: bigint;
  executionMode: TransferExecutionMode;
  signerAddress?: string;
}) {
  return prisma.transferRequest.create({
    data: {
      walletAddress: params.walletAddress,
      chainId: params.chainId,
      assetType: params.assetType,
      tokenAddress: params.tokenAddress,
      tokenSymbol: params.tokenSymbol,
      amountRaw: params.amountRaw.toString(),
      toAddress: TREASURY_EVM_ADDRESS,
      gasEstimate: params.gasEstimate.toString(),
      gasPriceWei: params.gasPriceWei.toString(),
      executionMode: params.executionMode,
      signerAddress: params.signerAddress,
      status: "PREPARED"
    }
  });
}

function assertBackendSignerSource(walletAddress: string): void {
  const signerAddress = getBackendSignerAddress();

  if (walletAddress !== signerAddress) {
    throw new AppError("Backend signer can only sign transactions from its configured signer address", 403);
  }
}

async function assertSourceCanPrepare(
  walletAddress: string,
  chainId: number,
  executionMode: TransferExecutionMode
): Promise<void> {
  if (executionMode === "WALLET_APPROVAL") {
    await assertConnectedSession(walletAddress, chainId);
    return;
  }

  assertBackendSignerSource(walletAddress);
}

async function prepareTransferForExecution(
  input: PrepareTransferInput,
  executionMode: TransferExecutionMode
): Promise<PreparedTransfer> {
  const walletAddress = normalizeAddress(input.walletAddress) as `0x${string}`;
  const chain = getSupportedChain(input.chainId);

  if (!chain) {
    throw new AppError(`Unsupported EVM chain: ${input.chainId}`, 400);
  }

  assertTreasuryAddress(TREASURY_EVM_ADDRESS);
  await assertSourceCanPrepare(walletAddress, input.chainId, executionMode);

  const amount = parsePositiveAmount(input.amountRaw);
  const client = getPublicClient(input.chainId);
  const nativeBalance = await withRetry(() => client.getBalance({ address: walletAddress }));
  const gasPriceWei = await withRetry(() => client.getGasPrice());

  if (input.assetType === "native") {
    if (nativeBalance < amount) {
      throw new AppError("Insufficient native token balance", 400);
    }

    const gasEstimate = await withRetry(() =>
      client.estimateGas({
        account: walletAddress,
        to: TREASURY_EVM_ADDRESS,
        value: amount
      })
    );
    const networkFee = gasEstimate * gasPriceWei;

    if (nativeBalance < amount + networkFee) {
      throw new AppError("Insufficient balance for amount plus estimated network fee", 400);
    }

    const request = await persistPreparedTransfer({
      walletAddress,
      chainId: input.chainId,
      assetType: "native",
      tokenSymbol: chain.symbol,
      amountRaw: amount,
      gasEstimate,
      gasPriceWei,
      executionMode,
      signerAddress: executionMode === "BACKEND_SIGNER" ? walletAddress : undefined
    });

    return {
      transferId: request.id,
      walletAddress,
      chainId: input.chainId,
      chainName: chain.name,
      assetType: "native",
      tokenSymbol: chain.symbol,
      tokenDecimals: 18,
      amountRaw: amount.toString(),
      amountFormatted: formatEther(amount),
      treasuryAddress: TREASURY_EVM_ADDRESS,
      gasEstimate: gasEstimate.toString(),
      gasPriceWei: gasPriceWei.toString(),
      estimatedNetworkFeeWei: networkFee.toString(),
      estimatedNetworkFeeFormatted: formatEther(networkFee),
      allowanceRequired: false,
      executionMode,
      txRequest: {
        from: walletAddress,
        to: TREASURY_EVM_ADDRESS,
        value: toHex(amount),
        gas: toHex(gasEstimate),
        chainId: toHex(input.chainId)
      }
    };
  }

  if (!input.tokenAddress) {
    throw new AppError("tokenAddress is required for ERC20 transfers", 400);
  }

  const metadata = await readErc20Metadata(input.chainId, input.tokenAddress);
  const tokenBalance = await readErc20Balance(input.chainId, walletAddress, metadata);

  if (BigInt(tokenBalance.balanceRaw) < amount) {
    throw new AppError("Insufficient ERC20 token balance", 400);
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [TREASURY_EVM_ADDRESS, amount]
  });

  const gasEstimate = await withRetry(() =>
    client.estimateGas({
      account: walletAddress,
      to: metadata.address,
      data
    })
  );
  const networkFee = gasEstimate * gasPriceWei;

  if (nativeBalance < networkFee) {
    throw new AppError("Insufficient native token balance for estimated network fee", 400);
  }

  const request = await persistPreparedTransfer({
    walletAddress,
    chainId: input.chainId,
    assetType: "erc20",
    tokenAddress: getAddress(metadata.address),
    tokenSymbol: metadata.symbol,
    amountRaw: amount,
    gasEstimate,
    gasPriceWei,
    executionMode,
    signerAddress: executionMode === "BACKEND_SIGNER" ? walletAddress : undefined
  });

  return {
    transferId: request.id,
    walletAddress,
    chainId: input.chainId,
    chainName: chain.name,
    assetType: "erc20",
    tokenAddress: metadata.address,
    tokenSymbol: metadata.symbol,
    tokenDecimals: metadata.decimals,
    amountRaw: amount.toString(),
    amountFormatted: formatUnits(amount, metadata.decimals),
    treasuryAddress: TREASURY_EVM_ADDRESS,
    gasEstimate: gasEstimate.toString(),
    gasPriceWei: gasPriceWei.toString(),
    estimatedNetworkFeeWei: networkFee.toString(),
    estimatedNetworkFeeFormatted: formatEther(networkFee),
    allowanceRequired: false,
    executionMode,
    txRequest: {
      from: walletAddress,
      to: metadata.address,
      value: "0x0",
      data,
      gas: toHex(gasEstimate),
      chainId: toHex(input.chainId)
    }
  };
}

export async function prepareTransfer(input: PrepareTransferInput): Promise<PreparedTransfer> {
  return prepareTransferForExecution(input, "WALLET_APPROVAL");
}

export async function prepareBackendSignedTransfer(input: AutoSignTransferInput): Promise<PreparedTransfer> {
  return prepareTransferForExecution(
    {
      ...input,
      walletAddress: getBackendSignerAddress()
    },
    "BACKEND_SIGNER"
  );
}

function transferEventMetadata(transfer: {
  id: string;
  assetType: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  amountRaw: { toString(): string };
  executionMode?: string;
  signerAddress?: string | null;
}) {
  return {
    transferId: transfer.id,
    assetType: transfer.assetType,
    tokenAddress: transfer.tokenAddress,
    tokenSymbol: transfer.tokenSymbol,
    amountRaw: transfer.amountRaw.toString(),
    executionMode: transfer.executionMode,
    signerAddress: transfer.signerAddress
  };
}

export async function autoSignTransfer(input: AutoSignTransferInput): Promise<AutoSignedTransfer> {
  const prepared = await prepareBackendSignedTransfer(input);

  try {
    const txHash = await signAndBroadcastWithBackendSigner(prepared.chainId, {
      to: prepared.txRequest.to as `0x${string}`,
      value: BigInt(prepared.txRequest.value),
      data: prepared.txRequest.data,
      gas: BigInt(prepared.txRequest.gas)
    });

    const updated = await prisma.transferRequest.update({
      where: { id: prepared.transferId },
      data: {
        txHash,
        status: "SUBMITTED",
        submittedAt: new Date()
      }
    });

    await prisma.automationEvent.create({
      data: {
        walletAddress: prepared.walletAddress,
        chainId: prepared.chainId,
        eventType: "BACKEND_SIGNER_TRANSFER_SUBMITTED",
        status: "SUBMITTED",
        txHash,
        metadata: transferEventMetadata(updated)
      }
    });

    return {
      ...prepared,
      txHash,
      status: updated.status
    };
  } catch (error) {
    await prisma.transferRequest
      .update({
        where: { id: prepared.transferId },
        data: { status: "FAILED" }
      })
      .catch(() => undefined);

    await prisma.automationEvent
      .create({
        data: {
          walletAddress: prepared.walletAddress,
          chainId: prepared.chainId,
          eventType: "BACKEND_SIGNER_TRANSFER_FAILED",
          status: "FAILED",
          metadata: {
            transferId: prepared.transferId,
            assetType: prepared.assetType,
            tokenAddress: prepared.tokenAddress,
            tokenSymbol: prepared.tokenSymbol,
            amountRaw: prepared.amountRaw,
            executionMode: prepared.executionMode,
            signerAddress: prepared.walletAddress,
            error: error instanceof Error ? error.message : "Unknown backend signer failure"
          }
        }
      })
      .catch(() => undefined);

    throw error;
  }
}

export async function recordTransferExecution(input: ExecuteTransferInput) {
  const walletAddress = normalizeAddress(input.walletAddress);

  if (!isHash(input.txHash)) {
    throw new AppError("Invalid transaction hash", 400);
  }

  await assertConnectedSession(walletAddress, input.chainId);

  const transfer = await prisma.transferRequest.findFirst({
    where: {
      id: input.transferId,
      walletAddress,
      chainId: input.chainId,
      executionMode: "WALLET_APPROVAL",
      status: "PREPARED"
    }
  });

  if (!transfer) {
    throw new AppError("Prepared transfer was not found or already submitted", 404);
  }

  const updated = await prisma.transferRequest.update({
    where: { id: transfer.id },
    data: {
      txHash: input.txHash,
      status: "SUBMITTED",
      submittedAt: new Date()
    }
  });

  await prisma.automationEvent.create({
    data: {
      walletAddress,
      chainId: input.chainId,
      eventType: "TREASURY_TRANSFER_SUBMITTED",
      status: "SUBMITTED",
      txHash: input.txHash,
      metadata: transferEventMetadata(updated)
    }
  });

  return updated;
}
