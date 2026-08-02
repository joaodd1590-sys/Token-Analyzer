"use strict";

const { getNetworkStatus } = require("./_lib/arc.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    return res.status(200).json(await getNetworkStatus());
  } catch (error) {
    console.error("Network status failed", error);
    return res.status(502).json({
      ok: false,
      code: error?.code || "NETWORK_UNAVAILABLE",
      message: "Arc Testnet RPC endpoints are temporarily unavailable."
    });
  }
};
