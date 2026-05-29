export const WALLETCONNECT_REQUIRED_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain"
] as const;

export const WALLETCONNECT_REQUIRED_EVENTS = ["accountsChanged", "chainChanged", "disconnect"] as const;

export const CONSENT_TEXT =
  "I understand and consent to the wallet interaction and automation flow." as const;
