"use strict";

const { inspectAddress } = require("./_lib/arc.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const result = await inspectAddress(req.query?.address);
    return res.status(result.ok === false ? 400 : 200).json(result);
  } catch (error) {
    console.error("Token inspection failed", error);
    return res.status(502).json({
      ok: false,
      code: error?.code || "INSPECTION_FAILED",
      message: "Arc Testnet or ArcScan could not complete the inspection. Try again in a moment."
    });
  }
};
