const fs = require("node:fs");
const path = require("node:path");

function loadProjectEnv(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function redact(err) {
  let msg = String(err && err.stack ? err.stack : err);
  for (const name of ["SEPOLIA_PRIVATE_KEY", "SEPOLIA_RPC_URL"]) {
    const value = process.env[name];
    if (!value) continue;
    msg = msg.split(value).join("[redacted]");
    const bare = value.replace(/^0x/i, "");
    if (bare && bare !== value) msg = msg.split(bare).join("[redacted]");
  }
  return msg;
}

function normalizePrivateKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("SEPOLIA_PRIVATE_KEY が設定されていません");
  }
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("SEPOLIA_PRIVATE_KEY の形式が不正です");
  }
  return hex;
}

module.exports = { loadProjectEnv, redact, normalizePrivateKey };
