"use strict";

const ARC_CHAIN_ID = 5_042_002;
const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_EXPLORER = "https://testnet.arcscan.app";
const RPC_URLS = [
  "https://rpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io"
];

const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOfZero: `0x70a08231${"0".repeat(64)}`,
  supportsErc721: `0x01ffc9a780ac58cd${"0".repeat(56)}`,
  supportsErc1155: `0x01ffc9a7d9b67a26${"0".repeat(56)}`
};

const OFFICIAL_TOKENS = {
  "0x3600000000000000000000000000000000000000": {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    standard: "ERC-20",
    label: "Official USDC interface on Arc Testnet"
  },
  "0x89b50855aa3be2f677cd6303cec089b5f319d72a": {
    name: "Euro Coin",
    symbol: "EURC",
    decimals: 6,
    standard: "ERC-20",
    label: "Official EURC contract on Arc Testnet"
  },
  "0xe9185f0c5f296ed1797aae4238d26ccabeadb86c": {
    name: "US Yield Coin",
    symbol: "USYC",
    decimals: 6,
    standard: "ERC-20",
    label: "Official USYC contract on Arc Testnet"
  }
};

const NETWORK_STATUS_CACHE_KEY = "token-analyzer-network-status";
const PREFERRED_RPC_CACHE_KEY = "token-analyzer-preferred-rpc";
const NETWORK_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const API_STATUS_TIMEOUT_MS = 2_200;
const RPC_PROBE_TIMEOUT_MS = 3_500;

const ui = {};
let lastAddress = "";

window.addEventListener("DOMContentLoaded", () => {
  cacheUi();
  initializeTheme();
  initializeEvents();
  initializeStickyHeader();

  const restoredCachedStatus = restoreCachedNetworkStatus();
  refreshNetworkStatus({ background: restoredCachedStatus });
  inspectAddressFromUrl();
});

function cacheUi() {
  const ids = [
    "appHeader",
    "analyzeForm",
    "tokenAddress",
    "analyzeBtn",
    "statusMsg",
    "themeToggle",
    "networkDot",
    "networkStatusText",
    "latestBlock",
    "rpcProvider",
    "rpcLatency",
    "emptyState",
    "results",
    "resultTitle",
    "resultBadges",
    "verdictBanner",
    "verdictIcon",
    "verdictTitle",
    "verdictText",
    "tokenAvatar",
    "tokenName",
    "tokenSymbol",
    "tokenAddressFull",
    "copyAddressBtn",
    "tStandard",
    "decimalsLabel",
    "tDecimals",
    "rawSupplyLabel",
    "tSupplyRaw",
    "formattedSupplyLabel",
    "tSupplyHuman",
    "tHolders",
    "explorerTokenLink",
    "riskPill",
    "riskTitle",
    "riskDescription",
    "riskNotes",
    "verificationPill",
    "cClassification",
    "cDetectionSource",
    "cBytecode",
    "cProxy",
    "cImplementation",
    "cRpc",
    "cBlock",
    "explorerAddressLink"
  ];

  for (const id of ids) ui[id] = document.getElementById(id);
}

function initializeEvents() {
  ui.analyzeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAnalyze();
  });

  ui.copyAddressBtn?.addEventListener("click", copyCurrentAddress);

  document.querySelectorAll(".example-chip").forEach((button) => {
    button.addEventListener("click", () => {
      ui.tokenAddress.value = button.dataset.address || "";
      handleAnalyze();
    });
  });
}

function initializeStickyHeader() {
  if (!ui.appHeader) return;

  let frameRequested = false;

  const updateHeader = () => {
    ui.appHeader.classList.toggle("is-scrolled", window.scrollY > 12);

    const computedTop = Number.parseFloat(
      window.getComputedStyle(ui.appHeader).top
    ) || 0;

    const offset = Math.ceil(
      ui.appHeader.offsetHeight + computedTop + 16
    );

    document.documentElement.style.setProperty(
      "--sticky-header-offset",
      `${offset}px`
    );

    frameRequested = false;
  };

  const requestUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(updateHeader);
  };

  updateHeader();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
}

function initializeTheme() {
  const preferred = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  let saved = preferred;

  try {
    saved = localStorage.getItem("token-analyzer-theme") || preferred;
  } catch {
    // Theme storage is optional.
  }

  applyTheme(saved);

  ui.themeToggle?.addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("token-analyzer-theme", next);
    } catch {
      // The theme still changes in the current tab.
    }
    applyTheme(next);
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const symbol = ui.themeToggle?.querySelector("span");
  if (symbol) symbol.textContent = theme === "dark" ? "☾" : "☀";
  ui.themeToggle?.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  );
}

async function refreshNetworkStatus({ background = false } = {}) {
  if (!background) {
    setNetworkState("checking");
    ui.networkStatusText.textContent = "Connecting to Arc Testnet…";
  }

  try {
    const data = await getNetworkStatus();
    if (!data?.ok) throw new Error(data?.message || "Network unavailable");

    applyNetworkStatus(data);
    cacheNetworkStatus(data);
  } catch (error) {
    console.warn("Network status check failed", error);

    // A recent cached result is preferable to an unnecessary red/offline flash.
    if (background && ui.networkDot?.classList.contains("is-online")) {
      ui.networkStatusText.textContent = "Arc Testnet · last connection available";
      return;
    }

    setNetworkState("offline");
    ui.networkStatusText.textContent = "Arc Testnet temporarily unavailable";
    ui.latestBlock.textContent = "—";
    ui.rpcProvider.textContent = "—";
    ui.rpcLatency.textContent = "—";
  }
}

function applyNetworkStatus(data, { cached = false } = {}) {
  setNetworkState("online");

  const networkName = data.network || data.name || "Arc Testnet";
  const mode =
    cached
      ? " · instant cache"
      : data.transport === "direct-rpc"
        ? " · direct mode"
        : "";

  ui.networkStatusText.textContent = `${networkName} online${mode}`;
  ui.latestBlock.textContent = formatInteger(data.latestBlock);
  ui.rpcProvider.textContent = data.rpcProvider || "Arc RPC";
  ui.rpcLatency.textContent = Number.isFinite(data.latencyMs)
    ? `${data.latencyMs} ms`
    : cached
      ? "cached"
      : "—";
}

function restoreCachedNetworkStatus() {
  try {
    const raw = localStorage.getItem(NETWORK_STATUS_CACHE_KEY);
    if (!raw) return false;

    const cached = JSON.parse(raw);
    const age = Date.now() - Number(cached?.savedAt || 0);
    const data = cached?.data;

    if (
      !data?.ok ||
      Number(data.chainId) !== ARC_CHAIN_ID ||
      age < 0 ||
      age > NETWORK_STATUS_CACHE_TTL_MS
    ) {
      localStorage.removeItem(NETWORK_STATUS_CACHE_KEY);
      return false;
    }

    applyNetworkStatus(data, { cached: true });
    return true;
  } catch {
    return false;
  }
}

function cacheNetworkStatus(data) {
  try {
    localStorage.setItem(
      NETWORK_STATUS_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        data: {
          ok: true,
          network: data.network || data.name || "Arc Testnet",
          chainId: Number(data.chainId || ARC_CHAIN_ID),
          latestBlock: data.latestBlock,
          rpcProvider: data.rpcProvider || "Arc RPC",
          latencyMs: data.latencyMs,
          transport: data.transport || "server-api"
        }
      })
    );
  } catch {
    // Network status caching is optional.
  }
}

function setNetworkState(state) {
  ui.networkDot?.classList.remove("is-online", "is-offline", "is-checking");
  ui.networkDot?.classList.add(`is-${state}`);
}

async function inspectAddressFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const address = params.get("address");
  if (!address) return;
  ui.tokenAddress.value = address;
  await handleAnalyze();
}

async function handleAnalyze() {
  const address = String(ui.tokenAddress?.value || "").trim();

  if (!isAddress(address)) {
    showFormMessage("Enter a valid address: 0x followed by 40 hexadecimal characters.", "error");
    ui.tokenAddress?.focus();
    return;
  }

  setLoading(true);
  showFormMessage("Reading token standard, metadata and contract information…", "loading");

  try {
    const data = await inspectAddress(address);
    if (!data?.ok) throw new Error(data?.message || "The address could not be inspected.");

    if (!data.isToken) {
      renderNonToken(data);
      updateAddressQuery(address);
      return;
    }

    renderToken(data);
    updateAddressQuery(address);
    const mode = data.transport === "direct-rpc" ? "direct RPC fallback" : "server API";
    showFormMessage(
      `${data.standard || "Token"} detected through ${mode} using ${data.network?.rpcProvider || "Arc RPC"}.`,
      "success"
    );
    scheduleResultScroll();
  } catch (error) {
    console.error(error);
    hideResults();
    showFormMessage(
      error?.message || "The network could not be reached. Check the deployment and try again.",
      "error"
    );
  } finally {
    setLoading(false);
  }
}

function renderNonToken(data) {
  hideResults();
  const description =
    data.classification === "wallet"
      ? "This address is a wallet or externally owned account. No contract bytecode was found on Arc Testnet."
      : "This address contains contract bytecode, but ArcScan and the contract calls did not identify a supported token standard.";
  showFormMessage(description, "warning");
}

function renderToken(data) {
  const token = data.token || data.metadata || data;
  const contract = data.contract || {};
  const network = data.network || {};
  const address = data.address;
  const standard = data.standard || token.standard || "Token";
  const name = token.name || data.official?.name || contract.contractName || "Unnamed token";
  const symbol = token.symbol || data.official?.symbol || "?";
  const isNft = standard === "ERC-721" || standard === "ERC-1155";

  lastAddress = address;
  ui.emptyState?.classList.add("hidden");
  ui.results?.classList.remove("hidden");

  ui.resultTitle.textContent = `${name} on Arc Testnet`;
  ui.tokenName.textContent = name;
  ui.tokenSymbol.textContent = symbol;
  ui.tokenAddressFull.textContent = address;
  ui.tStandard.textContent = standard;
  ui.tHolders.textContent = token.holdersCount ? formatInteger(token.holdersCount) : "Not indexed";

  if (isNft) {
    ui.decimalsLabel.textContent = "Decimals";
    ui.tDecimals.textContent = "Not applicable";
    ui.rawSupplyLabel.textContent = "Total minted / supply";
    ui.tSupplyRaw.textContent = token.totalSupply ?? "Not returned";
    ui.formattedSupplyLabel.textContent = "Display supply";
    ui.tSupplyHuman.textContent = token.totalSupply ? formatInteger(token.totalSupply) : "Not returned";
  } else {
    ui.decimalsLabel.textContent = "Decimals";
    ui.tDecimals.textContent = token.decimals ?? "Not returned";
    ui.rawSupplyLabel.textContent = "Raw total supply";
    ui.tSupplyRaw.textContent = token.totalSupply ?? "Not returned";
    ui.formattedSupplyLabel.textContent = "Formatted supply";
    ui.tSupplyHuman.textContent = formatTokenAmount(token.totalSupply, token.decimals);
  }

  renderAvatar(address, symbol, token.iconUrl);
  renderBadges(data);
  renderContractDetails(data);
  renderSignals(data);

  ui.explorerTokenLink.href = data.links?.token || `${ARC_EXPLORER}/token/${address}`;
  ui.explorerAddressLink.href = data.links?.address || `${ARC_EXPLORER}/address/${address}`;

  ui.latestBlock.textContent = formatInteger(network.latestBlock);
  ui.rpcProvider.textContent = network.rpcProvider || "Arc RPC";
  ui.rpcLatency.textContent = Number.isFinite(network.latencyMs) ? `${network.latencyMs} ms` : "—";
}

function renderAvatar(address, symbol, iconUrl) {
  const candidates = buildTokenIconCandidates(address, iconUrl);
  setAvatarFallback(symbol, { loading: candidates.length > 0 });

  if (candidates.length === 0) return;
  loadFirstAvailableTokenIcon(candidates, symbol);
}

function buildTokenIconCandidates(address, iconUrl) {
  const candidates = [];
  const normalizedExplorerIcon = normalizeIconUrl(iconUrl);

  if (normalizedExplorerIcon) candidates.push(normalizedExplorerIcon);

  if (isAddress(address) && /^https?:$/.test(window.location.protocol)) {
    candidates.push(
      new URL(
        `/api/token-icon?address=${encodeURIComponent(address.toLowerCase())}`,
        window.location.origin
      ).href
    );
  }

  return [...new Set(candidates)];
}

function loadFirstAvailableTokenIcon(candidates, symbol, index = 0) {
  if (index >= candidates.length) {
    setAvatarFallback(symbol);
    return;
  }

  const image = new Image();
  image.alt = `${String(symbol || "Token")} token logo`;
  image.className = "token-logo-image";
  image.decoding = "async";
  image.loading = "eager";
  image.referrerPolicy = "no-referrer";

  image.addEventListener(
    "load",
    () => {
      ui.tokenAvatar.replaceChildren(image);
      ui.tokenAvatar.classList.remove("is-loading");
      ui.tokenAvatar.classList.add("has-image");
    },
    { once: true }
  );

  image.addEventListener(
    "error",
    () => loadFirstAvailableTokenIcon(candidates, symbol, index + 1),
    { once: true }
  );

  image.src = candidates[index];
}

function setAvatarFallback(symbol, { loading = false } = {}) {
  ui.tokenAvatar.replaceChildren();
  ui.tokenAvatar.classList.remove("has-image");
  ui.tokenAvatar.classList.toggle("is-loading", loading);
  ui.tokenAvatar.textContent = String(symbol || "?").slice(0, 1).toUpperCase();
}

function renderBadges(data) {
  ui.resultBadges.replaceChildren();
  addBadge(data.standard || "Token", "accent");
  if (data.official) addBadge("Official network contract", "safe");
  if (data.contract?.verified) addBadge("Source verified", "safe");
  if (data.contract?.isProxy) addBadge("Proxy", "warning");

  function addBadge(label, style) {
    const span = document.createElement("span");
    span.className = `result-badge badge-${style}`;
    span.textContent = label;
    ui.resultBadges.appendChild(span);
  }
}

function renderContractDetails(data) {
  const contract = data.contract || {};
  const network = data.network || {};
  const sourceLabels = {
    "official-registry": "Official registry",
    arcscan: "ArcScan index",
    erc165: "ERC-165 interface",
    "contract-calls": "Contract calls"
  };

  ui.cClassification.textContent = `${data.standard || "Token"} token contract`;
  ui.cDetectionSource.textContent = sourceLabels[data.token?.standardSource] || "Combined checks";
  ui.cBytecode.textContent = Number.isFinite(contract.bytecodeSize)
    ? `${formatInteger(contract.bytecodeSize)} bytes`
    : "—";
  ui.cProxy.textContent = contract.isProxy
    ? `Yes${contract.proxyType ? ` · ${contract.proxyType}` : ""}`
    : "No common proxy signal";
  ui.cImplementation.textContent = contract.implementationAddress
    ? shortenAddress(contract.implementationAddress)
    : "—";
  ui.cImplementation.title = contract.implementationAddress || "";
  ui.cRpc.textContent = network.rpcProvider || "Arc RPC";
  ui.cBlock.textContent = formatInteger(network.latestBlock);
  ui.verificationPill.textContent = contract.verified ? "Verified source" : "Not verified";
  ui.verificationPill.className = contract.verified
    ? "verification-pill is-verified"
    : "verification-pill is-unverified";
}

function renderSignals(data) {
  const token = data.token || {};
  const contract = data.contract || {};
  const standard = data.standard || token.standard;
  const notes = [];
  let score = 0;

  if (data.official) {
    notes.push({ tone: "positive", text: data.official.label || "Address listed in official documentation." });
  }

  if (contract.verified) {
    notes.push({ tone: "positive", text: "Source code is verified in ArcScan." });
  } else {
    score += 1;
    notes.push({ tone: "warning", text: "Source code is not verified in ArcScan." });
  }

  if (contract.isProxy) {
    score += 1;
    notes.push({
      tone: "warning",
      text: "A proxy pattern was detected; behavior may depend on another implementation contract."
    });
  } else {
    notes.push({ tone: "positive", text: "No common EIP-1167 or EIP-1967 proxy signal was detected." });
  }

  if (standard === "ERC-20" || standard === "ERC-777" || standard === "ERC-4626") {
    if (token.decimals === null || token.decimals === undefined) {
      score += 2;
      notes.push({ tone: "danger", text: "A fungible token was detected, but decimals() was not returned." });
    } else {
      notes.push({ tone: "positive", text: `decimals() returned ${token.decimals}.` });
    }

    if (!token.totalSupply || token.totalSupply === "0") {
      score += 1;
      notes.push({ tone: "warning", text: "totalSupply() is missing or zero." });
    } else {
      notes.push({ tone: "positive", text: "totalSupply() returned a valid integer value." });
    }
  } else if (standard === "ERC-721") {
    notes.push({
      tone: token.supportsErc721 ? "positive" : "neutral",
      text: token.supportsErc721
        ? "The contract confirms the ERC-721 interface through ERC-165."
        : "ArcScan identifies this contract as ERC-721."
    });
    if (!token.totalSupply) {
      notes.push({ tone: "neutral", text: "totalSupply() is optional for ERC-721 and was not returned." });
    }
  } else if (standard === "ERC-1155") {
    notes.push({
      tone: token.supportsErc1155 ? "positive" : "neutral",
      text: token.supportsErc1155
        ? "The contract confirms the ERC-1155 interface through ERC-165."
        : "ArcScan identifies this contract as ERC-1155."
    });
    notes.push({ tone: "neutral", text: "ERC-1155 contracts can contain many token IDs, so one global supply may not exist." });
  }

  if (!token.name || !token.symbol) {
    score += 1;
    notes.push({ tone: "warning", text: "Name or symbol metadata is incomplete." });
  }

  if (data.official) score = Math.max(0, score - 2);

  if (score === 0) {
    setSignal("Likely Safe", "No obvious warning signs were found in the available automated checks.", "safe");
  } else if (score <= 2) {
    setSignal("Risky — Review Required", "Some signals require manual review before interacting with this contract.", "warning");
  } else {
    setSignal("High Risk", "Several expected signals are missing or unusual. Avoid interacting until the contract is reviewed.", "danger");
  }

  ui.riskNotes.replaceChildren();
  for (const note of notes) {
    const item = document.createElement("li");
    item.className = `signal-${note.tone}`;
    item.textContent = note.text;
    ui.riskNotes.appendChild(item);
  }
}

function setSignal(label, description, tone) {
  const icons = {
    safe: "✓",
    warning: "!",
    danger: "×",
    neutral: "?"
  };

  ui.riskPill.textContent = label;
  ui.riskPill.className = `risk-pill risk-${tone}`;
  ui.riskTitle.textContent = label;
  ui.riskDescription.textContent = description;

  if (ui.verdictBanner) {
    ui.verdictBanner.className = `verdict-banner verdict-${tone}`;
    ui.verdictIcon.textContent = icons[tone] || "?";
    ui.verdictTitle.textContent = label;
    ui.verdictText.textContent = description;

    // Restart the entrance animation for every new inspection.
    void ui.verdictBanner.offsetWidth;
    ui.verdictBanner.classList.add("is-revealed");
  }
}

function scheduleResultScroll() {
  if (!ui.results || ui.results.classList.contains("hidden")) return;

  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  window.setTimeout(() => {
    const target = ui.results;
    const targetRect = target.getBoundingClientRect();
    const headerRect = ui.appHeader?.getBoundingClientRect();
    const visibleTop = Math.max(18, (headerRect?.bottom || 0) + 14);
    const resultIsComfortablyVisible =
      targetRect.top >= visibleTop &&
      targetRect.top <= Math.max(visibleTop, window.innerHeight * 0.3);

    if (!resultIsComfortablyVisible) {
      const computedHeaderTop = ui.appHeader
        ? Number.parseFloat(window.getComputedStyle(ui.appHeader).top) || 0
        : 0;

      const stickyOffset =
        (ui.appHeader?.offsetHeight || 0) + computedHeaderTop + 18;

      const targetTop =
        window.scrollY + targetRect.top - stickyOffset;

      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: reduceMotion ? "auto" : "smooth"
      });
    }

    ui.results.classList.add("result-focus");
    window.setTimeout(
      () => ui.results?.classList.remove("result-focus"),
      1_600
    );
  }, 220);
}

function hideResults() {
  ui.results?.classList.add("hidden");
  ui.emptyState?.classList.remove("hidden");
  lastAddress = "";
}

function setLoading(loading) {
  ui.analyzeBtn?.classList.toggle("is-loading", loading);
  if (ui.analyzeBtn) ui.analyzeBtn.disabled = loading;
  if (ui.tokenAddress) ui.tokenAddress.disabled = loading;
}

function showFormMessage(message, state = "neutral") {
  ui.statusMsg.textContent = message;
  ui.statusMsg.dataset.state = state;
}

async function copyCurrentAddress() {
  if (!lastAddress) return;
  try {
    await navigator.clipboard.writeText(lastAddress);
    const previous = ui.copyAddressBtn.textContent;
    ui.copyAddressBtn.textContent = "Copied";
    setTimeout(() => {
      ui.copyAddressBtn.textContent = previous;
    }, 1_500);
  } catch {
    showFormMessage("Could not copy automatically. Select and copy the address manually.", "warning");
  }
}

function updateAddressQuery(address) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("address", address);
    window.history.replaceState({}, "", url);
  } catch {
    // Inspection still works if history access is blocked.
  }
}

/* ---------------- Network client ---------------- */

async function inspectAddress(address) {
  try {
    const apiData = await requestApi(`/api/arc-token?address=${encodeURIComponent(address)}`, 22_000);
    return { ...apiData, transport: "server-api" };
  } catch (apiError) {
    console.warn("Server API unavailable, using direct fallback", apiError);
    try {
      return await directInspectAddress(address);
    } catch (directError) {
      throw new Error(
        "The server API and the direct Arc RPC fallback both failed. Confirm that the complete api folder was uploaded to GitHub and redeployed by Vercel."
      );
    }
  }
}

async function getNetworkStatus() {
  const apiRequest = requestApi("/api/network-status", API_STATUS_TIMEOUT_MS).then((data) => {
    if (Number(data?.chainId) !== ARC_CHAIN_ID) {
      throw new Error("The server API returned an unexpected chain ID");
    }

    return {
      ...data,
      network: data.network || data.name || "Arc Testnet",
      transport: "server-api"
    };
  });

  const directRequest = getDirectNetworkStatus();

  // API and direct RPC start together. The first valid response is used.
  return firstSuccessful([directRequest, apiRequest]);
}

async function getDirectNetworkStatus() {
  const started = performance.now();
  const selected = await selectRpc();
  const blockHex = await rpcAt(selected.url, "eth_blockNumber", [], RPC_PROBE_TIMEOUT_MS);

  return {
    ok: true,
    network: "Arc Testnet",
    chainId: ARC_CHAIN_ID,
    latestBlock: Number(BigInt(blockHex)),
    rpcProvider: safeHostname(selected.url),
    latencyMs: Math.round(performance.now() - started),
    transport: "direct-rpc"
  };
}

async function directInspectAddress(inputAddress) {
  const address = inputAddress.toLowerCase();
  const started = performance.now();
  const selected = await selectRpc();
  const [code, blockHex] = await Promise.all([
    rpcAt(selected.url, "eth_getCode", [address, "latest"]),
    rpcAt(selected.url, "eth_blockNumber", [])
  ]);

  const network = {
    name: "Arc Testnet",
    chainId: ARC_CHAIN_ID,
    latestBlock: Number(BigInt(blockHex)),
    rpcProvider: safeHostname(selected.url),
    latencyMs: Math.round(performance.now() - started),
    transport: "direct-rpc"
  };

  if (!code || isZeroHex(code)) {
    return {
      ok: true,
      isToken: false,
      classification: "wallet",
      address,
      network,
      transport: "direct-rpc"
    };
  }

  const [nameHex, symbolHex, decimalsHex, supplyHex, balanceHex, erc721Hex, erc1155Hex, explorer] =
    await Promise.all([
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.name }, "latest"]),
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.symbol }, "latest"]),
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.decimals }, "latest"]),
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.totalSupply }, "latest"]),
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.balanceOfZero }, "latest"]),
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.supportsErc721 }, "latest"]),
      safeRpc(selected.url, "eth_call", [{ to: address, data: SELECTORS.supportsErc1155 }, "latest"]),
      getExplorerToken(address).catch(() => emptyExplorerToken())
    ]);

  const official = OFFICIAL_TOKENS[address] || null;
  const metadata = {
    name: decodeAbiString(nameHex) || explorer.name || official?.name || null,
    symbol: decodeAbiString(symbolHex) || explorer.symbol || official?.symbol || null,
    decimals: decodeDecimals(decimalsHex) ?? explorer.decimals ?? official?.decimals ?? null,
    totalSupply: decodeUint(supplyHex) ?? explorer.totalSupply ?? null
  };
  const supportsErc721 = decodeBool(erc721Hex) === true;
  const supportsErc1155 = decodeBool(erc1155Hex) === true;
  const balanceOfZero = decodeUint(balanceHex);

  let standard = official?.standard || explorer.tokenType || null;
  if (!standard && supportsErc1155) standard = "ERC-1155";
  if (!standard && supportsErc721) standard = "ERC-721";
  if (
    !standard &&
    metadata.decimals !== null &&
    metadata.totalSupply !== null &&
    balanceOfZero !== null &&
    (metadata.name || metadata.symbol)
  ) {
    standard = "ERC-20";
  }

  const isToken = Boolean(standard);

  return {
    ok: true,
    isToken,
    classification: isToken ? standard.toLowerCase().replace("-", "") : "contract",
    standard,
    address,
    metadata,
    token: {
      ...metadata,
      standard,
      holdersCount: explorer.holdersCount,
      iconUrl: explorer.iconUrl,
      supportsErc721,
      supportsErc1155,
      standardSource: official
        ? "official-registry"
        : explorer.tokenType
          ? "arcscan"
          : supportsErc721 || supportsErc1155
            ? "erc165"
            : isToken
              ? "contract-calls"
              : null
    },
    contract: {
      bytecodeSize: Math.max(0, (String(code).length - 2) / 2),
      verified: explorer.verified,
      indexed: explorer.indexed,
      contractName: explorer.contractName,
      isProxy: false,
      proxyType: null,
      implementationAddress: null
    },
    official,
    network,
    links: {
      address: `${ARC_EXPLORER}/address/${address}`,
      token: `${ARC_EXPLORER}/token/${address}`
    },
    transport: "direct-rpc"
  };
}

async function getExplorerToken(address) {
  const encoded = encodeURIComponent(address);
  const [tokenResult, addressResult, contractResult, legacyResult] = await Promise.allSettled([
    fetchJson(`${ARC_EXPLORER}/api/v2/tokens/${encoded}`, 7_000),
    fetchJson(`${ARC_EXPLORER}/api/v2/addresses/${encoded}`, 7_000),
    fetchJson(`${ARC_EXPLORER}/api/v2/smart-contracts/${encoded}`, 7_000),
    fetchJson(`${ARC_EXPLORER}/api?module=token&action=getToken&contractaddress=${encoded}`, 7_000)
  ]);

  const tokenInfo = tokenResult.status === "fulfilled" ? tokenResult.value : null;
  const addressInfo = addressResult.status === "fulfilled" ? addressResult.value : null;
  const contractInfo = contractResult.status === "fulfilled" ? contractResult.value : null;
  const legacyEnvelope = legacyResult.status === "fulfilled" ? legacyResult.value : null;
  const legacyToken = legacyEnvelope?.status === "1" ? legacyEnvelope.result : null;
  const source = tokenInfo || addressInfo?.token || legacyToken;

  return {
    indexed: Boolean(source || addressInfo || contractInfo),
    tokenType: normalizeTokenStandard(source?.type || legacyToken?.type),
    name: cleanDecodedText(source?.name || legacyToken?.name || null),
    symbol: cleanDecodedText(source?.symbol || legacyToken?.symbol || null),
    decimals: parseDecimals(source?.decimals ?? legacyToken?.decimals),
    totalSupply: parseInteger(source?.total_supply ?? source?.totalSupply ?? legacyToken?.totalSupply),
    holdersCount: source?.holders_count ?? source?.holders ?? null,
    iconUrl: normalizeIconUrl(
      firstNonEmptyValue(
        source?.icon_url,
        source?.iconUrl,
        source?.logo_url,
        source?.logoUrl,
        source?.image_url,
        source?.imageUrl,
        source?.image,
        addressInfo?.token?.icon_url,
        addressInfo?.token?.logo_url,
        addressInfo?.token?.image_url
      )
    ),
    contractName: contractInfo?.name || addressInfo?.name || null,
    verified: Boolean(
      addressInfo?.is_verified ||
        contractInfo?.is_verified ||
        contractInfo?.is_fully_verified ||
        contractInfo?.is_partially_verified
    )
  };
}

function emptyExplorerToken() {
  return {
    indexed: false,
    tokenType: null,
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: null,
    holdersCount: null,
    iconUrl: null,
    contractName: null,
    verified: false
  };
}

async function requestApi(path, timeoutMs) {
  if (!/^https?:$/.test(window.location.protocol)) throw new Error("API unavailable in local file mode");
  const response = await fetchWithTimeout(new URL(path, window.location.origin).href, {
    headers: { Accept: "application/json" },
    credentials: "same-origin"
  }, timeoutMs);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("The /api functions were not deployed");
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${response.status}`);
  return data;
}

async function selectRpc() {
  const preferred = getPreferredRpc();
  const candidates = preferred
    ? [preferred, ...RPC_URLS.filter((url) => url !== preferred)]
    : [...RPC_URLS];

  const probes = candidates.map(async (url) => {
    const started = performance.now();
    const chainId = String(
      await rpcAt(url, "eth_chainId", [], RPC_PROBE_TIMEOUT_MS)
    ).toLowerCase();

    if (chainId !== ARC_CHAIN_ID_HEX) {
      throw new Error(`${safeHostname(url)} returned ${chainId}`);
    }

    return {
      url,
      latencyMs: Math.round(performance.now() - started)
    };
  });

  const selected = await firstSuccessful(probes);
  cachePreferredRpc(selected.url);
  return selected;
}

function getPreferredRpc() {
  try {
    const url = localStorage.getItem(PREFERRED_RPC_CACHE_KEY);
    return RPC_URLS.includes(url) ? url : null;
  } catch {
    return null;
  }
}

function cachePreferredRpc(url) {
  if (!RPC_URLS.includes(url)) return;

  try {
    localStorage.setItem(PREFERRED_RPC_CACHE_KEY, url);
  } catch {
    // Preferred RPC caching is optional.
  }
}

function firstSuccessful(promises) {
  if (typeof Promise.any === "function") {
    return Promise.any(promises);
  }

  return new Promise((resolve, reject) => {
    const errors = [];
    let pending = promises.length;

    if (pending === 0) {
      reject(new Error("No connection attempts were provided"));
      return;
    }

    promises.forEach((promise, index) => {
      Promise.resolve(promise).then(resolve).catch((error) => {
        errors[index] = error;
        pending -= 1;

        if (pending === 0) {
          reject(
            new Error(
              errors
                .map((item) => item?.message || "Connection failed")
                .join(" | ")
            )
          );
        }
      });
    });
  });
}

async function rpcAt(url, method, params = [], timeoutMs = 8_000) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  }, timeoutMs);
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || "JSON-RPC error");
  return json.result ?? null;
}

async function safeRpc(url, method, params) {
  try {
    return await rpcAt(url, method, params);
  } catch {
    return null;
  }
}

async function fetchJson(url, timeoutMs) {
  const response = await fetchWithTimeout(url, {
    mode: "cors",
    headers: { Accept: "application/json" }
  }, timeoutMs);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Decoders and formatting ---------------- */

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function isZeroHex(value) {
  return !value || value === "0x" || /^0x0*$/i.test(value);
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function cleanDecodedText(value) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return cleaned && cleaned.length <= 256 ? cleaned : null;
}

function hexToUtf8(hex) {
  const pairs = String(hex || "").match(/.{1,2}/g) || [];
  const bytes = Uint8Array.from(pairs.map((pair) => Number.parseInt(pair, 16)));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeAbiString(hex) {
  if (!hex || hex === "0x" || isZeroHex(hex) || !/^0x[0-9a-f]+$/i.test(hex)) return null;
  const data = hex.slice(2);
  if (data.length === 64) return cleanDecodedText(hexToUtf8(data));
  if (data.length < 128) return null;

  try {
    const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
    const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
    if (!Number.isSafeInteger(length) || length < 1 || length > 256) return null;
    return cleanDecodedText(hexToUtf8(data.slice(offset + 64, offset + 64 + length * 2)));
  } catch {
    return null;
  }
}

function decodeUint(hex) {
  if (!hex || hex === "0x" || !/^0x[0-9a-f]+$/i.test(hex)) return null;
  try {
    return BigInt(hex).toString(10);
  } catch {
    return null;
  }
}

function decodeDecimals(hex) {
  return parseDecimals(decodeUint(hex));
}

function decodeBool(hex) {
  const value = decodeUint(hex);
  return value === null ? null : value !== "0";
}

function normalizeTokenStandard(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const standards = {
    ERC20: "ERC-20",
    ERC721: "ERC-721",
    ERC1155: "ERC-1155",
    ERC404: "ERC-404",
    ERC777: "ERC-777",
    ERC4626: "ERC-4626"
  };
  return standards[compact] || null;
}

function parseInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return BigInt(String(value)).toString(10);
  } catch {
    return null;
  }
}

function parseDecimals(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : null;
}

function firstNonEmptyValue(...values) {
  return values.find(
    (value) => typeof value === "string" && value.trim().length > 0
  ) || null;
}

function normalizeIconUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim(), ARC_EXPLORER);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function formatTokenAmount(raw, decimals) {
  if (raw === null || raw === undefined || decimals === null || decimals === undefined) return "—";
  try {
    const normalizedRaw = BigInt(raw).toString(10);
    const precision = Number(decimals);
    if (!Number.isInteger(precision) || precision < 0 || precision > 255) return "—";
    const padded = normalizedRaw.padStart(precision + 1, "0");
    const integerPart = precision === 0 ? padded : padded.slice(0, -precision);
    const fractionalPart = precision === 0 ? "" : padded.slice(-precision).replace(/0+$/, "").slice(0, 8);
    const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return fractionalPart ? `${grouped}.${fractionalPart}` : grouped;
  } catch {
    return "—";
  }
}

function formatInteger(value) {
  if (value === null || value === undefined || value === "") return "—";
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("en-US") : "—";
  }
}

function shortenAddress(address) {
  return address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address || "—";
}
