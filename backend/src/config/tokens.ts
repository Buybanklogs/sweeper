export type CommonToken = {
  chainId: 1 | 56 | 137;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name: string;
};

export const COMMON_TOKENS: CommonToken[] = [
  {
    chainId: 1,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin"
  },
  {
    chainId: 1,
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD"
  },
  {
    chainId: 1,
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    decimals: 18,
    name: "Dai Stablecoin"
  },
  {
    chainId: 56,
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    decimals: 18,
    name: "Tether USD"
  },
  {
    chainId: 56,
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    symbol: "USDC",
    decimals: 18,
    name: "USD Coin"
  },
  {
    chainId: 137,
    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    symbol: "USDC.e",
    decimals: 6,
    name: "USD Coin"
  },
  {
    chainId: 137,
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD"
  },
  {
    chainId: 137,
    address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    symbol: "DAI",
    decimals: 18,
    name: "Dai Stablecoin"
  }
];

export function getCommonTokens(chainId: number): CommonToken[] {
  return COMMON_TOKENS.filter((token) => token.chainId === chainId);
}
