import { Router } from "express";
import {
  executeTransferController,
  prepareAllTransfersController,
  prepareTransferController
} from "../controllers/transferController";

export const transferRouter = Router();

transferRouter.post("/prepare", prepareTransferController);
transferRouter.post("/prepare-all", prepareAllTransfersController);
transferRouter.post("/execute", executeTransferController);
