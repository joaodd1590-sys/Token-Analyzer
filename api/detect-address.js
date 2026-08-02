"use strict";

const { inspectAddress } = require("./_lib/arc.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, type: "invalid", code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const result = await inspectAddress(req.query?.address);
    return res.status(result.ok === false ? 400 : 200).json({
      ok: result.ok,
      type: result.classification,
      standard: result.standard || null,
      isToken: result.isToken,
      address: result.address || null,
      message: result.message || null
    });
  } catch (error) {
    console.error("Address detection failed", error);
    return res.status(502).json({
      ok: false,
      type: "unavailable",
      code: error?.code || "DETECTION_FAILED",
      message: "Address detection is temporarily unavailable."
    });
  }
};
