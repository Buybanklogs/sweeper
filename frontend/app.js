import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.21.8";

const CONSENT_TEXT = "I understand and consent to the wallet interaction and automation flow.";

const state = {
  provider: null,
  config: null,
  walletAddress: "",
  approvedChains: []
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  consentCheckbox: document.querySelector("#consentCheckbox"),
  walletAddress: document.querySelector("#walletAddress"),
  networkGrid: document.querySelector("#networkGrid"),
  status: document.querySelector("#status"),
  connectWallet: document.querySelector("#connectWallet"),
  syncWallet: document.querySelector("#syncWallet"),
  disconnectWallet: document.querySelector("#disconnectWallet")
};

const savedApiBase = localStorage.getItem("EVM_WALLETCONNECT_API_BASE_URL");
if (savedApiBase) {
  elements.apiBaseUrl.value = savedApiBase;
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

function updateActions() {
  const hasConsent = elements.consentCheckbox.checked;
  const connected = Boolean(state.walletAddress);

  elements.connectWallet.disabled = !hasConsent || connected;
  elements.syncWallet.disabled = !connected;
  elements.disconnectWallet.disabled = !connected;
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

      return `
        <article class="network">
          <span>${chain.name || chain.chainName}</span>
          <strong>${balance}</strong>
          ${chain.blockNumber ? `<small>Block ${chain.blockNumber}</small>` : ""}
        </article>
      `;
    })
    .join("");
}

async function getJson(path) {
  const response = await fetch(`${apiBaseUrl()}${path}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

async function postJson(path, body) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  renderNetworks(result);
  setStatus("Wallet synchronized.", result);
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
  elements.walletAddress.textContent = "Not connected";
  renderNetworks();
  updateActions();
  setStatus(message);
}

function handleAsync(fn) {
  return async () => {
    try {
      await fn();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected error");
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

loadConfig()
  .then(() => updateActions())
  .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load backend configuration."));
