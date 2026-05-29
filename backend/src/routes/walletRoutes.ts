import { Router } from "express";
import {
  recordSessionController,
  syncWalletController,
  walletConfigController
} from "../controllers/walletController";

export const walletRouter = Router();

walletRouter.get("/config", walletConfigController);
walletRouter.post("/session", recordSessionController);
walletRouter.post("/sync", syncWalletController);
