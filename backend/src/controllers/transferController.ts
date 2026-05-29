import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getBackendSignerStatus } from "../blockchain/backendSigner";
import { env } from "../config/env";
import { autoSignTransfer, prepareTransfer, recordTransferExecution } from "../services/transferService";
import { AppError } from "../utils/errors";

const prepareSchema = z.object({
  walletAddress: z.string(),
  chainId: z.coerce.number().int(),
  assetType: z.enum(["native", "erc20"]),
  amountRaw: z.string(),
  tokenAddress: z.string().optional()
});

const executeSchema = z.object({
  transferId: z.string().min(1),
  walletAddress: z.string(),
  chainId: z.coerce.number().int(),
  txHash: z.string()
});

const backendSignerAutoSignSchema = prepareSchema.omit({ walletAddress: true });

function readBackendSignerTrigger(req: Request): string | undefined {
  const authorization = req.get("authorization") ?? "";
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  return bearerToken ?? req.get("x-backend-signer-secret");
}

function secretMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function assertBackendSignerTrigger(req: Request): void {
  if (!env.BACKEND_SIGNER_TRIGGER_SECRET) {
    return;
  }

  const provided = readBackendSignerTrigger(req);

  if (!provided || !secretMatches(provided, env.BACKEND_SIGNER_TRIGGER_SECRET)) {
    throw new AppError("Backend signer authorization failed", 401);
  }
}

export function backendSignerStatusController(_req: Request, res: Response) {
  res.json(getBackendSignerStatus());
}

export async function prepareTransferController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = prepareSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid transfer preparation payload", 400, parsed.error.flatten());
    }

    const result = await prepareTransfer(parsed.data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function autoSignTransferController(req: Request, res: Response, next: NextFunction) {
  try {
    assertBackendSignerTrigger(req);

    const parsed = backendSignerAutoSignSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid backend signer payload", 400, parsed.error.flatten());
    }

    const result = await autoSignTransfer(parsed.data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function executeTransferController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = executeSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid transfer execution payload", 400, parsed.error.flatten());
    }

    const result = await recordTransferExecution(parsed.data);
    res.json({
      transferId: result.id,
      txHash: result.txHash,
      status: result.status
    });
  } catch (error) {
    next(error);
  }
}
