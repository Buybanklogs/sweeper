import { erc20Abi, formatUnits, getAddress } from "viem";
import { getPublicClient } from "./evmClients";
import { CommonToken } from "../config/tokens";
import { normalizeAddress } from "../utils/address";

export type Erc20Metadata = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name?: string;
};

export type Erc20Balance = Erc20Metadata & {
  balanceRaw: string;
  balanceFormatted: string;
};

export async function readErc20Metadata(chainId: number, tokenAddressInput: string): Promise<Erc20Metadata> {
  const address = getAddress(tokenAddressInput) as `0x${string}`;
  const client = getPublicClient(chainId);

  const [symbol, decimals, name] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address, abi: erc20Abi, functionName: "name" }).catch(() => undefined)
  ]);

  return {
    address,
    symbol: String(symbol),
    decimals: Number(decimals),
    name: name ? String(name) : undefined
  };
}

export async function readErc20Balance(
  chainId: number,
  walletAddressInput: string,
  token: CommonToken | Erc20Metadata
): Promise<Erc20Balance> {
  const walletAddress = normalizeAddress(walletAddressInput) as `0x${string}`;
  const client = getPublicClient(chainId);
  const balance = (await client.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletAddress]
  })) as bigint;

  return {
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
    name: token.name,
    balanceRaw: balance.toString(),
    balanceFormatted: formatUnits(balance, token.decimals)
  };
}
