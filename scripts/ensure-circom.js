// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pins = JSON.parse(fs.readFileSync(path.join(root, "tools", "circom-2.2.3-sha256.json"), "utf8"));
const EXPECTED = pins.version;

function versionOf(binary) {
  const probe = spawnSync(binary, ["--version"], { encoding: "utf8" });
  const text = `${probe.stdout || ""}\n${probe.stderr || ""}`;
  const match = text.match(/(\d+\.\d+\.\d+)/);
  if (probe.status !== 0 || !match) return null;
  return match[1];
}

function systemBinary() {
  const found = versionOf("circom");
  if (found === EXPECTED) return "circom";
  return null;
}

async function downloadPinned() {
  const key = `${process.platform}-${process.arch}`;
  const pin = pins.binaries[key];
  if (!pin) {
    throw new Error(`circom ${EXPECTED} の固定バイナリが ${key} にはありません`);
  }
  const dir = path.join(root, "tools", "bin");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, pin.file);
  if (fs.existsSync(dest)) {
    const current = createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
    if (current === pin.sha256 && versionOf(dest) === EXPECTED) return dest;
  }
  const response = await fetch(`${pins.source}${pin.file}`);
  if (!response.ok) throw new Error(`circom のダウンロードに失敗しました: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== pin.sha256) throw new Error("circom の SHA-256 が固定値と一致しません");
  fs.writeFileSync(dest, bytes, { mode: 0o755 });
  if (versionOf(dest) !== EXPECTED) throw new Error("ダウンロードした circom の版が一致しません");
  return dest;
}

export async function ensureCircom() {
  return systemBinary() || downloadPinned();
}
