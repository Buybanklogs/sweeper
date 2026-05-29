import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import pino from "pino";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { prisma } from "./db/prisma";
import { isAppError } from "./utils/errors";

const logger = pino({ name: "evm-walletconnect-api" });
const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Backend-Signer-Secret"]
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.use("/api", apiRouter);

app.use((_req, _res, next) => {
  next(Object.assign(new Error("Route not found"), { statusCode: 404 }));
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details
    });
    return;
  }

  const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : 500;
  const message = error instanceof Error ? error.message : "Internal server error";

  logger.error({ error }, message);
  res.status(statusCode).json({ error: message });
});

async function bootstrap() {
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "EVM WalletConnect backend listening");
  });

  const shutdown = async () => {
    logger.info("Shutting down");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch(async (error) => {
  logger.error({ error }, "Failed to start backend");
  await prisma.$disconnect();
  process.exit(1);
});
