"use strict";

const ARC_CHAIN_ID = 5_042_002;
const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_EXPLORER = "https://testnet.arcscan.app";

const DEFAULT_RPC_URLS = Object.freeze([
  "https://rpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io"
]);

const SELECTORS = Object.freeze({
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  balanceOfZero: `0x70a08231${"0".repeat(64)}`,
  supportsErc721: `0x01ffc9a780ac58cd${"0".repeat(56)}`,
  supportsErc1155: `0x01ffc9a7d9b67a26${"0".repeat(56)}`
});

const RUNTIME_SIGNAL_SELECTORS = Object.freeze({
  ownership: Object.freeze([
    "8da5cb5b", // owner()
    "893d20e8", // getOwner()
    "f2fde38b", // transferOwnership(address)
    "715018a6"  // renounceOwnership()
  ]),
  mint: Object.freeze([
    "40c10f19", // mint(address,uint256)
    "a0712d68", // mint(uint256)
    "449a52f8"  // common mint variant
  ]),
  pause: Object.freeze([
    "8456cb59", // pause()
    "3f4ba83a", // unpause()
    "5c975abb"  // paused()
  ]),
  blacklist: Object.freeze([
    "f9f92be4",
    "153b0d1e",
    "9cfe42da",
    "eb91e651",
    "fe575a87",
    "dbac26e9",
    "8d1fdf2f"
  ]),
  fees: Object.freeze([
    "69fe0e2d",
    "0b78f9c0",
    "47062402",
    "2b14ca56",
    "4f7041a5",
    "cc1776d3",
    "46469afb",
    "1bff7898"
  ]),
  tradingLimits: Object.freeze([
    "ec28438a",
    "8c0b5e22",
    "f8b45b05",
    "8a8c523c",
    "4ada218b"
  ]),
  upgrade: Object.freeze([
    "3659cfe6", // upgradeTo(address)
    "4f1ef286"  // upgradeToAndCall(address,bytes)
  ])
});

function detectRuntimeSignals(bytecode) {
  const code = String(bytecode || "").toLowerCase().replace(/^0x/, "");
  const scanned = code.length > 0;
  const matches = {};

  for (const [group, selectors] of Object.entries(RUNTIME_SIGNAL_SELECTORS)) {
    matches[group] = scanned
      ? selectors.filter((selector) => code.includes(selector))
      : [];
  }

  return {
    scanned,
    ownershipControls: matches.ownership.length > 0,
    mintCapability: matches.mint.length > 0,
    pauseControls: matches.pause.length > 0,
    blacklistControls: matches.blacklist.length > 0,
    feeControls: matches.fees.length > 0,
    tradingLimits: matches.tradingLimits.length > 0,
    upgradeFunctions: matches.upgrade.length > 0,
    detectedGroups: Object.entries(matches)
      .filter(([, selectors]) => selectors.length > 0)
      .map(([group]) => group),
    matchedSelectorCount: Object.values(matches).reduce(
      (total, selectors) => total + selectors.length,
      0
    )
  };
}

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const OFFICIAL_TOKENS = Object.freeze({
  "0x3600000000000000000000000000000000000000": {
    name: "USD Coin",
    symbol: "USDC",
    label: "Official USDC interface on Arc Testnet",
    decimals: 6,
    standard: "ERC-20"
  },
  "0x89b50855aa3be2f677cd6303cec089b5f319d72a": {
    name: "Euro Coin",
    symbol: "EURC",
    label: "Official EURC contract on Arc Testnet",
    decimals: 6,
    standard: "ERC-20"
  },
  "0xe9185f0c5f296ed1797aae4238d26ccabeadb86c": {
    name: "US Yield Coin",
    symbol: "USYC",
    label: "Official USYC contract on Arc Testnet",
    decimals: 6,
    standard: "ERC-20"
  }
});

function getRpcUrls() {
  const configured = String(process.env.ARC_RPC_URLS || process.env.ARC_RPC_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...configured, ...DEFAULT_RPC_URLS])];
}

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

function firstNonEmptyValue(...values) {
  return values.find(
    (value) => typeof value === "string" && value.trim().length > 0
  ) || null;
}

function normalizeExplorerIconUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim(), ARC_EXPLORER);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
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

function decodeAbiString(hex) {
  if (!hex || hex === "0x" || isZeroHex(hex) || !/^0x[0-9a-f]+$/i.test(hex)) return null;
  const data = hex.slice(2);

  if (data.length === 64) {
    try {
      return cleanDecodedText(Buffer.from(data, "hex").toString("utf8"));
    } catch {
      return null;
    }
  }

  if (data.length < 128) return null;

  try {
    const offsetBytes = Number(BigInt(`0x${data.slice(0, 64)}`));
    if (!Number.isSafeInteger(offsetBytes) || offsetBytes < 0) return null;

    const offset = offsetBytes * 2;
    if (offset + 64 > data.length) return null;

    const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
    if (!Number.isSafeInteger(length) || length < 1 || length > 256) return null;

    const start = offset + 64;
    const end = start + length * 2;
    if (end > data.length) return null;

    return cleanDecodedText(Buffer.from(data.slice(start, end), "hex").toString("utf8"));
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
  const value = decodeUint(hex);
  if (value === null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : null;
}

function decodeBool(hex) {
  const value = decodeUint(hex);
  return value === null ? null : value !== "0";
}

function decodeStorageAddress(hex) {
  if (!hex || isZeroHex(hex) || !/^0x[0-9a-f]{64}$/i.test(hex)) return null;
  const address = `0x${hex.slice(-40)}`.toLowerCase();
  return isZeroHex(address) ? null : address;
}

function extractMinimalProxyImplementation(bytecode) {
  const code = String(bytecode || "").toLowerCase().replace(/^0x/, "");
  const match = code.match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/);
  return match ? `0x${match[1]}` : null;
}

function normalizeTokenStandard(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/_/g, "-")
    .replace(/^ERC\s*/, "ERC-")
    .replace(/ERC--/g, "ERC-");

  const aliases = {
    ERC20: "ERC-20",
    "ERC-20": "ERC-20",
    ERC721: "ERC-721",
    "ERC-721": "ERC-721",
    ERC1155: "ERC-1155",
    "ERC-1155": "ERC-1155",
    ERC404: "ERC-404",
    "ERC-404": "ERC-404",
    ERC777: "ERC-777",
    "ERC-777": "ERC-777",
    ERC4626: "ERC-4626",
    "ERC-4626": "ERC-4626"
  };

  return aliases[normalized] || null;
}

function parseExplorerInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return BigInt(String(value)).toString(10);
  } catch {
    return null;
  }
}

function parseExplorerDecimals(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : null;
}

async function fetchJson(url, options = {}, timeoutMs = 7_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Token-Analyzer/2.2",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpcRequest(method, params = [], options = {}) {
  const timeoutMs = options.timeoutMs || 7_000;
  const urls = getRpcUrls();
  const orderedUrls = options.preferredUrl
    ? [options.preferredUrl, ...urls.filter((url) => url !== options.preferredUrl)]
    : urls;
  const errors = [];

  for (const url of orderedUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Token-Analyzer/2.2"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          method,
          params
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (json.error) {
        const error = new Error(json.error.message || "JSON-RPC error");
        error.isJsonRpcError = true;
        error.rpcCode = json.error.code;
        throw error;
      }
      return { result: json.result ?? null, rpcUrl: url };
    } catch (error) {
      if (error?.isJsonRpcError) throw error;
      errors.push(`${safeHostname(url)}: ${error?.message || "request failed"}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const error = new Error(`All Arc RPC endpoints failed: ${errors.join(" | ")}`);
  error.code = "ARC_RPC_UNAVAILABLE";
  throw error;
}

async function callContract(address, data, preferredUrl) {
  try {
    const { result } = await rpcRequest(
      "eth_call",
      [{ to: address, data }, "latest"],
      { preferredUrl }
    );
    return result && result !== "0x" ? result : null;
  } catch {
    return null;
  }
}

async function getExplorerData(address) {
  const encoded = encodeURIComponent(address);
  const [addressResult, tokenResult, contractResult, legacyResult] = await Promise.allSettled([
    fetchJson(`${ARC_EXPLORER}/api/v2/addresses/${encoded}`, {}, 6_000),
    fetchJson(`${ARC_EXPLORER}/api/v2/tokens/${encoded}`, {}, 6_000),
    fetchJson(`${ARC_EXPLORER}/api/v2/smart-contracts/${encoded}`, {}, 6_000),
    fetchJson(
      `${ARC_EXPLORER}/api?module=token&action=getToken&contractaddress=${encoded}`,
      {},
      6_000
    )
  ]);

  const addressInfo = addressResult.status === "fulfilled" ? addressResult.value : null;
  const tokenInfo = tokenResult.status === "fulfilled" ? tokenResult.value : addressInfo?.token || null;
  const contractInfo = contractResult.status === "fulfilled" ? contractResult.value : null;
  const legacyEnvelope = legacyResult.status === "fulfilled" ? legacyResult.value : null;
  const legacyToken = legacyEnvelope?.status === "1" ? legacyEnvelope.result : null;
  const source = tokenInfo || legacyToken || addressInfo?.token || null;

  return {
    indexed: Boolean(addressInfo || tokenInfo || contractInfo || legacyToken),
    verified: Boolean(
      addressInfo?.is_verified ||
        contractInfo?.is_verified ||
        contractInfo?.is_fully_verified ||
        contractInfo?.is_partially_verified
    ),
    tokenType: normalizeTokenStandard(
      source?.type || addressInfo?.token?.type || legacyToken?.type
    ),
    name: cleanDecodedText(source?.name || legacyToken?.name || null),
    symbol: cleanDecodedText(source?.symbol || legacyToken?.symbol || null),
    decimals: parseExplorerDecimals(source?.decimals ?? legacyToken?.decimals),
    totalSupply: parseExplorerInteger(
      source?.total_supply ?? source?.totalSupply ?? legacyToken?.totalSupply
    ),
    iconUrl: normalizeExplorerIconUrl(
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
    holdersCount:
      source?.holders_count ?? source?.holders ?? addressInfo?.token?.holders_count ?? null,
    contractName: contractInfo?.name || addressInfo?.name || null,
    implementationAddress:
      addressInfo?.implementation_address ||
      addressInfo?.implementation_address_hash ||
      contractInfo?.implementation_address ||
      null,
    minimalProxyAddress: contractInfo?.minimal_proxy_address_hash || null,
    creationTransactionHash: addressInfo?.creation_transaction_hash || null
  };
}

function emptyExplorerData() {
  return {
    indexed: false,
    verified: false,
    tokenType: null,
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: null,
    iconUrl: null,
    holdersCount: null,
    contractName: null,
    implementationAddress: null,
    minimalProxyAddress: null,
    creationTransactionHash: null
  };
}

async function inspectAddress(inputAddress) {
  if (!isAddress(inputAddress)) {
    return {
      ok: false,
      code: "INVALID_ADDRESS",
      message: "Address must contain 0x followed by 40 hexadecimal characters.",
      classification: "invalid",
      isToken: false
    };
  }

  const address = inputAddress.toLowerCase();
  const startedAt = Date.now();
  const chain = await rpcRequest("eth_chainId");

  if (String(chain.result).toLowerCase() !== ARC_CHAIN_ID_HEX) {
    const error = new Error(`Unexpected chain ID: ${chain.result}`);
    error.code = "WRONG_CHAIN";
    throw error;
  }

  const preferredUrl = chain.rpcUrl;
  const [{ result: code }, { result: blockHex }] = await Promise.all([
    rpcRequest("eth_getCode", [address, "latest"], { preferredUrl }),
    rpcRequest("eth_blockNumber", [], { preferredUrl })
  ]);

  const network = {
    name: "Arc Testnet",
    chainId: ARC_CHAIN_ID,
    nativeCurrency: "USDC",
    latestBlock: blockHex ? Number(BigInt(blockHex)) : null,
    rpcProvider: safeHostname(preferredUrl),
    latencyMs: Date.now() - startedAt,
    explorer: ARC_EXPLORER
  };

  if (!code || isZeroHex(code)) {
    return {
      ok: true,
      isToken: false,
      classification: "wallet",
      address,
      network,
      message: "The address has no deployed bytecode on Arc Testnet.",
      links: { address: `${ARC_EXPLORER}/address/${address}` }
    };
  }

  const [
    nameHex,
    symbolHex,
    decimalsHex,
    supplyHex,
    balanceHex,
    erc721Hex,
    erc1155Hex,
    implementationSlot,
    explorer
  ] = await Promise.all([
    callContract(address, SELECTORS.name, preferredUrl),
    callContract(address, SELECTORS.symbol, preferredUrl),
    callContract(address, SELECTORS.decimals, preferredUrl),
    callContract(address, SELECTORS.totalSupply, preferredUrl),
    callContract(address, SELECTORS.balanceOfZero, preferredUrl),
    callContract(address, SELECTORS.supportsErc721, preferredUrl),
    callContract(address, SELECTORS.supportsErc1155, preferredUrl),
    rpcRequest("eth_getStorageAt", [address, EIP1967_IMPLEMENTATION_SLOT, "latest"], {
      preferredUrl
    }).catch(() => ({ result: null })),
    getExplorerData(address).catch(emptyExplorerData)
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

  const erc20Signals = {
    name: Boolean(metadata.name),
    symbol: Boolean(metadata.symbol),
    decimals: metadata.decimals !== null,
    totalSupply: metadata.totalSupply !== null,
    balanceOf: balanceOfZero !== null
  };
  const erc20SignalCount = Object.values(erc20Signals).filter(Boolean).length;

  if (
    !standard &&
    metadata.decimals !== null &&
    metadata.totalSupply !== null &&
    balanceOfZero !== null &&
    erc20SignalCount >= 4
  ) {
    standard = "ERC-20";
  }

  const isToken = Boolean(standard);
  const storageImplementation = decodeStorageAddress(implementationSlot?.result || null);
  const minimalProxyImplementation = extractMinimalProxyImplementation(code);
  const explorerImplementation = isAddress(explorer.implementationAddress)
    ? explorer.implementationAddress.toLowerCase()
    : null;
  const implementationAddress =
    explorerImplementation || storageImplementation || minimalProxyImplementation || null;
  const minimalProxy = Boolean(minimalProxyImplementation || explorer.minimalProxyAddress);

  return {
    ok: true,
    isToken,
    classification: isToken ? standard.toLowerCase().replace("-", "") : "contract",
    standard,
    address,
    name: metadata.name,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    totalSupply: metadata.totalSupply,
    metadata,
    contract: {
      bytecodeSize: Math.max(0, (String(code).length - 2) / 2),
      verified: Boolean(explorer.verified),
      indexed: Boolean(explorer.indexed),
      contractName: explorer.contractName,
      isProxy: Boolean(minimalProxy || implementationAddress),
      proxyType: minimalProxy
        ? "EIP-1167"
        : implementationAddress
          ? "EIP-1967 or explorer-detected"
          : null,
      implementationAddress,
      creationTransactionHash: explorer.creationTransactionHash,
      runtimeSignals: detectRuntimeSignals(code)
    },
    token: {
      ...metadata,
      standard,
      holdersCount: explorer.holdersCount,
      iconUrl: explorer.iconUrl,
      balanceOfZero,
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
              : null,
      erc20Signals,
      erc20SignalCount
    },
    official: official
      ? { ...official, source: "Arc official contract-address documentation" }
      : null,
    network,
    links: {
      address: `${ARC_EXPLORER}/address/${address}`,
      token: `${ARC_EXPLORER}/token/${address}`
    },
    message: isToken
      ? `${standard} token detected.`
      : "Contract bytecode exists, but no supported token standard was detected."
  };
}

async function getNetworkStatus() {
  const startedAt = Date.now();
  const chain = await rpcRequest("eth_chainId", [], { timeoutMs: 6_000 });
  const block = await rpcRequest("eth_blockNumber", [], {
    preferredUrl: chain.rpcUrl,
    timeoutMs: 6_000
  });
  const chainId = Number(BigInt(chain.result));

  return {
    ok: chainId === ARC_CHAIN_ID,
    network: "Arc Testnet",
    chainId,
    nativeCurrency: "USDC",
    latestBlock: Number(BigInt(block.result)),
    rpcProvider: safeHostname(chain.rpcUrl),
    latencyMs: Date.now() - startedAt,
    explorer: ARC_EXPLORER
  };
}

module.exports = {
  ARC_CHAIN_ID,
  ARC_CHAIN_ID_HEX,
  ARC_EXPLORER,
  DEFAULT_RPC_URLS,
  OFFICIAL_TOKENS,
  SELECTORS,
  decodeAbiString,
  decodeBool,
  decodeDecimals,
  decodeStorageAddress,
  decodeUint,
  detectRuntimeSignals,
  emptyExplorerData,
  extractMinimalProxyImplementation,
  getExplorerData,
  getNetworkStatus,
  getRpcUrls,
  inspectAddress,
  isAddress,
  isZeroHex,
  normalizeTokenStandard,
  rpcRequest
};
