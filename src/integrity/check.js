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
import { sha256Bytes, sha256File } from "./hash.js";

const HEX64 = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new IntegrityError(message);
}

export async function checkIntegrity(root = PROJECT_ROOT) {
  const manifestPath = path.join(root, MANIFEST_REL);
  const manifestShaPath = path.join(root, MANIFEST_SHA_REL);

  if (!fs.existsSync(manifestPath)) fail("manifest.json が見つかりません");
  if (!fs.existsSync(manifestShaPath)) fail("manifest.sha256 が見つかりません");

  const manifestStat = fs.statSync(manifestPath);
  if (manifestStat.size <= 0 || manifestStat.size > MAX_MANIFEST_BYTES) {
    fail("manifest.json のサイズが不正です");
  }

  const manifestBytes = fs.readFileSync(manifestPath);
  const recordedManifestHash = fs.readFileSync(manifestShaPath, "utf8").trim();
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
  for (const name of expectedNames) {
    const recorded = manifest.artifacts[name];
    if (typeof recorded !== "string" || !HEX64.test(recorded)) {
      fail(`${name} の記録ハッシュが不正です`);
    }
    const filePath = path.join(root, ARTIFACTS[name]);
    if (!fs.existsSync(filePath)) fail(`${name} が見つかりません`);
    const actual = sha256File(filePath);
    if (actual !== recorded) fail(`${name} の SHA-256 が manifest と一致しません`);
    checked[name] = actual;
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
      const size = fs.statSync(path.join(root, ARTIFACTS[name])).size;
      if (record.bytes !== size) fail(`${name} のサイズが manifest と一致しません`);
    }
  }

  return {
    version: manifest.version,
    artifacts: checked,
    manifest,
    manifestSha256: actualManifestHash,
  };
}
