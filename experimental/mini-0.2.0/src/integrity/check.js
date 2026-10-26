// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import {
  ARTIFACTS,
  MANIFEST_REL,
  MANIFEST_SHA_REL,
  MAX_MANIFEST_BYTES,
  PROJECT_ROOT,
  VERSION,
} from "../constants.js";
import { IntegrityError } from "../errors.js";
import { sha256Bytes } from "./hash.js";

const HEX64 = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new IntegrityError(message);
}

function readOpened(filePath, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size <= 0 || (maxBytes !== undefined && info.size > maxBytes)) {
      return { status: "invalid-size" };
    }
    const bytes = Buffer.alloc(info.size);
    const read = fs.readSync(fd, bytes, 0, info.size, 0);
    if (read !== info.size) return { status: "invalid-size" };
    return { status: "ok", bytes };
  } catch (err) {
    if (err && err.code === "ENOENT") return { status: "missing" };
    throw err;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export async function checkIntegrity(root = PROJECT_ROOT) {
  const manifestPath = path.join(root, MANIFEST_REL);
  const manifestShaPath = path.join(root, MANIFEST_SHA_REL);
  const manifestRead = readOpened(manifestPath, MAX_MANIFEST_BYTES);
  if (manifestRead.status === "missing") fail("manifest.json が見つかりません");
  if (manifestRead.status !== "ok") fail("manifest.json のサイズが不正です");
  const manifestShaRead = readOpened(manifestShaPath, MAX_MANIFEST_BYTES);
  if (manifestShaRead.status === "missing") fail("manifest.sha256 が見つかりません");
  if (manifestShaRead.status !== "ok") fail("manifest.sha256 の形式が不正です");

  const manifestBytes = manifestRead.bytes;
  const recordedManifestHash = manifestShaRead.bytes.toString("utf8").trim();
  if (!HEX64.test(recordedManifestHash)) fail("manifest.sha256 の形式が不正です");
  const actualManifestHash = sha256Bytes(manifestBytes);
  if (actualManifestHash !== recordedManifestHash) {
    fail("manifest.sha256 が manifest.json と一致しません");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail("manifest.json を解釈できません");
  }

  if (!manifest || manifest.version !== VERSION) {
    fail("manifest の version が一致しません");
  }
  if (!manifest.proofSystem || manifest.proofSystem.protocol !== "groth16" || manifest.proofSystem.curve !== "bn254") {
    fail("manifest の証明系が mini の Groth16/BN254 と一致しません");
  }
  if (!manifest.ceremony || manifest.ceremony.production !== false) {
    fail("この manifest は production 用として扱えません");
  }
  if (!manifest.artifacts || typeof manifest.artifacts !== "object" || Array.isArray(manifest.artifacts)) {
    fail("manifest の artifacts が不正です");
  }

  const expectedNames = Object.keys(ARTIFACTS);
  const actualNames = Object.keys(manifest.artifacts);
  if (actualNames.length !== expectedNames.length || expectedNames.some((name) => !Object.hasOwn(manifest.artifacts, name))) {
    fail("manifest の artifact 一覧が想定と一致しません");
  }

  const checked = {};
  const sizes = {};
  for (const name of expectedNames) {
    const recorded = manifest.artifacts[name];
    if (typeof recorded !== "string" || !HEX64.test(recorded)) {
      fail(`${name} の記録ハッシュが不正です`);
    }
    const opened = readOpened(path.join(root, ARTIFACTS[name]));
    if (opened.status === "missing") fail(`${name} が見つかりません`);
    if (opened.status !== "ok") fail(`${name} の SHA-256 が manifest と一致しません`);
    const actual = sha256Bytes(opened.bytes);
    if (actual !== recorded) fail(`${name} の SHA-256 が manifest と一致しません`);
    checked[name] = actual;
    sizes[name] = opened.bytes.length;
  }

  if (manifest.files !== undefined) {
    if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
      fail("manifest の files が不正です");
    }
    for (const name of expectedNames) {
      const record = manifest.files[name];
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        fail(`${name} の file 記録がありません`);
      }
      if (record.path !== ARTIFACTS[name]) fail(`${name} の path が一致しません`);
      if (record.sha256 !== checked[name]) fail(`${name} の file 記録ハッシュが一致しません`);
      if (!Number.isSafeInteger(record.bytes) || record.bytes < 1) {
        fail(`${name} のサイズ記録が不正です`);
      }
      if (record.bytes !== sizes[name]) fail(`${name} のサイズが manifest と一致しません`);
    }
  }

  return {
    version: manifest.version,
    artifacts: checked,
    manifest,
    manifestSha256: actualManifestHash,
  };
}
