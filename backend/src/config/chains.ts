import { defineChain } from "viem";
import { mainnet, bsc, polygon } from "viem/chains";
import { env } from "./env";

export type SupportedChain = {
  id: 1 | 56 | 137;
  caip2: `eip155:${number}`;
  name: string;
  symbol: string;
  explorerUrl: string;
  rpcUrl: string;
  viemChain: ReturnType<typeof defineChain>;
};

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    id: 1,
    caip2: "eip155:1",
    name: "Ethereum",
    symbol: "ETH",
    explorerUrl: "https://etherscan.io",
    rpcUrl: env.ETH_RPC_URL,
    viemChain: mainnet
  },
  {
    id: 56,
    caip2: "eip155:56",
    name: "BNB Smart Chain",
    symbol: "BNB",
    explorerUrl: "https://bscscan.com",
    rpcUrl: env.BSC_RPC_URL,
    viemChain: bsc
  },
  {
    id: 137,
    caip2: "eip155:137",
    name: "Polygon",
    symbol: "MATIC",
    explorerUrl: "https://polygonscan.com",
    rpcUrl: env.POLYGON_RPC_URL,
    viemChain: polygon
  }
];

const configuredIds = new Set(
  env.SYNC_SUPPORTED_CHAINS.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value))
);

export const ACTIVE_CHAINS = SUPPORTED_CHAINS.filter((chain) => configuredIds.has(chain.id));

export function getSupportedChain(chainId: number): SupportedChain | undefined {
  return ACTIVE_CHAINS.find((chain) => chain.id === chainId);
}
