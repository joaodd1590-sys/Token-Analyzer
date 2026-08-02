"use strict";

const ARC_EXPLORER = "https://testnet.arcscan.app";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif"
]);

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function firstNonEmptyValue(...values) {
  return values.find(
    (value) => typeof value === "string" && value.trim().length > 0
  ) || null;
}

function normalizeRemoteIconUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim(), ARC_EXPLORER);
    if (url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, timeoutMs = 5_000) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Token-Analyzer/2.6"
      }
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Explorer returned HTTP ${response.status}`);
  }

  return response.json();
}

function extractIconUrl(tokenInfo, addressInfo) {
  const source = tokenInfo || addressInfo?.token || null;

  return normalizeRemoteIconUrl(
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
  );
}

async function findIconUrl(address) {
  const encoded = encodeURIComponent(address);
  const [tokenResult, addressResult] = await Promise.allSettled([
    fetchJson(`${ARC_EXPLORER}/api/v2/tokens/${encoded}`),
    fetchJson(`${ARC_EXPLORER}/api/v2/addresses/${encoded}`)
  ]);

  const tokenInfo =
    tokenResult.status === "fulfilled" ? tokenResult.value : null;
  const addressInfo =
    addressResult.status === "fulfilled" ? addressResult.value : null;

  return extractIconUrl(tokenInfo, addressInfo);
}

async function downloadImage(url) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
        "User-Agent": "Token-Analyzer/2.6"
      },
      redirect: "follow"
    },
    8_000
  );

  if (!response.ok) {
    throw new Error(`Image host returned HTTP ${response.status}`);
  }

  const contentType = String(
    response.headers.get("content-type") || ""
  ).split(";")[0].trim().toLowerCase();

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Unsupported image type: ${contentType || "unknown"}`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Token image is too large");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Token image is empty or too large");
  }

  return { bytes, contentType };
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800"
  );

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      code: "METHOD_NOT_ALLOWED"
    });
  }

  const address = String(req.query?.address || "").toLowerCase();
  if (!isAddress(address)) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_ADDRESS",
      message: "A valid token contract address is required."
    });
  }

  try {
    const iconUrl = await findIconUrl(address);

    if (!iconUrl) {
      return res.status(404).json({
        ok: false,
        code: "TOKEN_ICON_NOT_FOUND",
        message: "ArcScan has no token image registered for this address."
      });
    }

    const image = await downloadImage(iconUrl);
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.bytes.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(image.bytes);
  } catch (error) {
    console.warn("Token icon lookup failed", error);
    return res.status(404).json({
      ok: false,
      code: "TOKEN_ICON_UNAVAILABLE",
      message: "The token image could not be loaded."
    });
  }
}

module.exports = handler;
module.exports._test = {
  extractIconUrl,
  normalizeRemoteIconUrl,
  findIconUrl,
  downloadImage
};
