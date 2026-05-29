import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  prepareSweepTransfers,
  prepareTransfer,
  recordTransferExecution
} from "../services/transferService";
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

const prepareAllSchema = z.object({
  walletAddress: z.string(),
  chains: z.array(z.coerce.number().int()).optional()
});

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

export async function prepareAllTransfersController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = prepareAllSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid transfer review payload", 400, parsed.error.flatten());
    }

    const result = await prepareSweepTransfers(parsed.data);
    res.json(result);
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
