import { Router } from "express";
import { walletRouter } from "./walletRoutes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

apiRouter.use("/wallet", walletRouter);
