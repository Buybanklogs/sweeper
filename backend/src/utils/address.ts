import { getAddress, isAddress } from "viem";
import { AppError } from "./errors";

export function normalizeAddress(address: string): string {
  const trimmed = address.trim();

  if (!isAddress(trimmed)) {
    throw new AppError("Invalid EVM wallet address", 400);
  }

  return getAddress(trimmed);
}
