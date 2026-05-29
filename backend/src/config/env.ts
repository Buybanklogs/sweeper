import dotenv from "dotenv";
import { z } from "zod";
import { getAddress, isAddress } from "viem";

dotenv.config();

const privateKeyPattern = /^(0x)?[0-9a-fA-F]{64}$/;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WALLETCONNECT_PROJECT_ID: z.string().min(1, "WALLETCONNECT_PROJECT_ID is required"),
  TREASURY_EVM_ADDRESS: z
    .string()
    .refine((address) => isAddress(address), "TREASURY_EVM_ADDRESS must be a valid EVM address"),
  BACKEND_SIGNER_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  BACKEND_SIGNER_PRIVATE_KEY: z
    .string()
    .optional()
    .default("")
    .refine((value) => value === "" || privateKeyPattern.test(value), {
      message: "BACKEND_SIGNER_PRIVATE_KEY must be a 32-byte hex private key"
    }),
  BACKEND_SIGNER_TRIGGER_SECRET: z.string().optional().default(""),
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

if (parsed.data.BACKEND_SIGNER_ENABLED && !parsed.data.BACKEND_SIGNER_PRIVATE_KEY) {
  throw new Error("Invalid environment configuration: BACKEND_SIGNER_PRIVATE_KEY is required when BACKEND_SIGNER_ENABLED=true");
}

const corsOrigin =
  parsed.data.CORS_ORIGIN === "*"
    ? "*"
    : parsed.data.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const backendSignerPrivateKey = parsed.data.BACKEND_SIGNER_PRIVATE_KEY
  ? parsed.data.BACKEND_SIGNER_PRIVATE_KEY.startsWith("0x")
    ? parsed.data.BACKEND_SIGNER_PRIVATE_KEY
    : `0x${parsed.data.BACKEND_SIGNER_PRIVATE_KEY}`
  : undefined;

export const env = {
  ...parsed.data,
  TREASURY_EVM_ADDRESS: getAddress(parsed.data.TREASURY_EVM_ADDRESS),
  BACKEND_SIGNER_PRIVATE_KEY: backendSignerPrivateKey,
  CORS_ORIGIN: corsOrigin
};
