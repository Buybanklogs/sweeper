import { Router } from "express";
import {
  autoSignTransferController,
  backendSignerStatusController,
  executeTransferController,
  prepareTransferController
} from "../controllers/transferController";

export const transferRouter = Router();

transferRouter.post("/prepare", prepareTransferController);
transferRouter.post("/execute", executeTransferController);
transferRouter.get("/backend-signer/status", backendSignerStatusController);
transferRouter.post("/backend-signer/auto-sign", autoSignTransferController);
