import { getAddress } from "viem";
import { env } from "./env";
import { AppError } from "../utils/errors";

export const TREASURY_EVM_ADDRESS = env.TREASURY_EVM_ADDRESS as `0x${string}`;

export function assertTreasuryAddress(address: string): `0x${string}` {
  const normalized = getAddress(address);

  if (normalized !== TREASURY_EVM_ADDRESS) {
    throw new AppError("Invalid treasury destination", 403);
  }

  return normalized as `0x${string}`;
}
