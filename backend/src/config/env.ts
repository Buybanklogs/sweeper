import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WALLETCONNECT_PROJECT_ID: z.string().min(1, "WALLETCONNECT_PROJECT_ID is required"),
  ETH_RPC_URL: z.string().url("ETH_RPC_URL must be a valid RPC URL"),
  BSC_RPC_URL: z.string().url("BSC_RPC_URL must be a valid RPC URL"),
  POLYGON_RPC_URL: z.string().url("POLYGON_RPC_URL must be a valid RPC URL"),
  CORS_ORIGIN: z.string().optional().default("*"),
  SYNC_SUPPORTED_CHAINS: z.string().optional().default("1,56,137")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const corsOrigin =
  parsed.data.CORS_ORIGIN === "*"
    ? "*"
    : parsed.data.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

export const env = {
  ...parsed.data,
  CORS_ORIGIN: corsOrigin
};
