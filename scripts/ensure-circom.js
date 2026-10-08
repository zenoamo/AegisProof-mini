// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_VERSION = "2.2.3";
const EXPECTED_SOURCE = "https://github.com/iden3/circom/releases/download/v2.2.3/";
const RELEASES = {
  "linux-x64": {
    file: "circom-linux-amd64",
    url: "https://github.com/iden3/circom/releases/download/v2.2.3/circom-linux-amd64",
  },
  "win32-x64": {
    file: "circom-windows-amd64.exe",
    url: "https://github.com/iden3/circom/releases/download/v2.2.3/circom-windows-amd64.exe",
  },
  "darwin-x64": {
    file: "circom-macos-amd64",
    url: "https://github.com/iden3/circom/releases/download/v2.2.3/circom-macos-amd64",
  },
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function versionOf(binary) {
  const probe = spawnSync(binary, ["--version"], { encoding: "utf8" });
  const text = `${probe.stdout || ""}\n${probe.stderr || ""}`;
  const match = text.match(/(\d+\.\d+\.\d+)/);
  if (probe.status !== 0 || !match) return null;
  return match[1];
}

function systemBinary() {
  const found = versionOf("circom");
  if (found === EXPECTED_VERSION) return "circom";
  return null;
}

function readPin() {
  const pins = JSON.parse(fs.readFileSync(path.join(root, "tools", "circom-2.2.3-sha256.json"), "utf8"));
  if (pins.version !== EXPECTED_VERSION || pins.source !== EXPECTED_SOURCE) {
    throw new Error("circom の固定版または配布元が 2.2.3 の記録と一致しません");
  }
  return pins;
}

function releaseForThisHost(pins) {
  const key = `${process.platform}-${process.arch}`;
  const release = RELEASES[key];
  const pin = pins.binaries?.[key];
  if (!release || !pin || pin.file !== release.file || !/^[0-9a-f]{64}$/.test(pin.sha256)) {
    throw new Error(`circom ${EXPECTED_VERSION} の固定バイナリが ${key} にはありません`);
  }
  return { file: release.file, url: release.url, sha256: pin.sha256 };
}

function readBytes(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    return fs.readFileSync(fd);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeExclusive(filePath, bytes) {
  const fd = fs.openSync(filePath, "wx", 0o755);
  try {
    fs.writeFileSync(fd, bytes);
  } finally {
    fs.closeSync(fd);
  }
}

function replaceVerified(filePath, bytes) {
  const partial = `${filePath}.${randomBytes(8).toString("hex")}.partial`;
  writeExclusive(partial, bytes);
  fs.rmSync(filePath, { force: true });
  try {
    fs.renameSync(partial, filePath);
  } catch (err) {
    fs.rmSync(partial, { force: true });
    throw err;
  }
}

function materializeVerified(fileName, bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aegisproof-circom-"));
  const dest = path.join(dir, fileName);
  writeExclusive(dest, bytes);
  return dest;
}

async function downloadUntrusted(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`circom のダウンロードに失敗しました: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Downloaded bytes stay in memory until their SHA-256 matches the committed pin.
// Only that buffer is written. Execution happens after the write, on that copy.
async function verifiedBytes(spec, cachePath) {
  const cached = readBytes(cachePath);
  if (cached && sha256(cached) === spec.sha256) return cached;
  const untrusted = await downloadUntrusted(spec.url);
  if (sha256(untrusted) !== spec.sha256) {
    throw new Error("circom の SHA-256 が固定値と一致しません");
  }
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  replaceVerified(cachePath, untrusted);
  return untrusted;
}

export async function ensureCircom() {
  const system = systemBinary();
  if (system) return system;
  const spec = releaseForThisHost(readPin());
  const cachePath = path.join(root, "tools", "bin", spec.file);
  const bytes = await verifiedBytes(spec, cachePath);
  const executable = materializeVerified(spec.file, bytes);
  if (versionOf(executable) !== EXPECTED_VERSION) {
    throw new Error("ダウンロードした circom の版が一致しません");
  }
  return executable;
}
