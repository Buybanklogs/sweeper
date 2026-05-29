import { Router } from "express";
import { transferRouter } from "./transferRoutes";
import { walletRouter } from "./walletRoutes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

apiRouter.use("/wallet", walletRouter);
apiRouter.use("/transfer", transferRouter);
