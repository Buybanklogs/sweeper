import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ACTIVE_CHAINS } from "../config/chains";
import { CONSENT_TEXT, WALLETCONNECT_REQUIRED_EVENTS, WALLETCONNECT_REQUIRED_METHODS } from "../config/constants";
import { env } from "../config/env";
import { recordWalletSession } from "../services/walletSessionService";
import { syncWallet } from "../services/walletSyncService";
import { AppError } from "../utils/errors";

const sessionSchema = z.object({
  walletAddress: z.string(),
  connector: z.string().min(1).default("walletconnect"),
  chains: z.array(z.coerce.number().int()).min(1),
  consentGranted: z.boolean(),
  consentText: z.string()
});

const syncSchema = z.object({
  walletAddress: z.string(),
  chains: z.array(z.coerce.number().int()).optional()
});

export function walletConfigController(_req: Request, res: Response) {
  res.json({
    walletConnectProjectId: env.WALLETCONNECT_PROJECT_ID,
    consentText: CONSENT_TEXT,
    supportedChains: ACTIVE_CHAINS.map((chain) => ({
      id: chain.id,
      caip2: chain.caip2,
      name: chain.name,
      symbol: chain.symbol,
      explorerUrl: chain.explorerUrl
    })),
    walletConnect: {
      methods: WALLETCONNECT_REQUIRED_METHODS,
      events: WALLETCONNECT_REQUIRED_EVENTS
    }
  });
}

export async function recordSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = sessionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid wallet session payload", 400, parsed.error.flatten());
    }

    const session = await recordWalletSession(parsed.data);

    res.status(201).json({
      sessionId: session.id,
      walletAddress: session.walletAddress,
      chains: session.chains,
      status: session.status
    });
  } catch (error) {
    next(error);
  }
}

export async function syncWalletController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = syncSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError("Invalid wallet sync payload", 400, parsed.error.flatten());
    }

    const result = await syncWallet(parsed.data.walletAddress, parsed.data.chains);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
