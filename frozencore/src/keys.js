// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import { sha256File } from "../../src/integrity/hash.js";
import { ARTIFACTS, PROJECT_ROOT } from "./constants.js";
import { ProofError } from "./errors.js";

export const LEGACY_STATEMENT_R1CS = "frozencore/artifacts/statement.r1cs";
export const LEGACY_STATEMENT_ZKEY = "frozencore/artifacts/statement.zkey";
export const LEGACY_STATEMENT_VK = "frozencore/keys/statement_verification_key.json";
export const LEGACY_GUEST_R1CS = "frozencore/artifacts/guest.r1cs";

export function refuseProductionFallback(mode) {
  if (mode === "production") {
    throw new ProofError("本番鍵は存在せず、開発用鍵には切り替えません", "PRODUCTION");
  }
}

export function assertDistinctFromLegacy(activeName, legacyRel) {
  const legacyPath = path.join(PROJECT_ROOT, legacyRel);
  const activePath = path.join(PROJECT_ROOT, ARTIFACTS[activeName]);
  if (!fs.existsSync(legacyPath) || !fs.existsSync(activePath)) return;
  if (sha256File(legacyPath) === sha256File(activePath)) {
    throw new ProofError(`${activeName} が固定前の成果物と同一です`, "ARTIFACT");
  }
}

export function productionReadiness() {
  return {
    ready: false,
    mode: "development",
    productionKeysPresent: false,
    fallbackToDevelopmentKeys: false,
    activeStatement: ARTIFACTS["statement.zkey"],
    activeGuest: ARTIFACTS["guest.zkey"],
    legacyStatement: LEGACY_STATEMENT_ZKEY,
    missing: [
      "multiple ceremony contributors",
      "toxic-waste destruction record",
      "production key directory",
      "external trust anchors",
    ],
  };
}

const PROTECTED_REL = Object.freeze([
  LEGACY_STATEMENT_R1CS,
  LEGACY_STATEMENT_ZKEY,
  LEGACY_STATEMENT_VK,
  LEGACY_GUEST_R1CS,
  "frozencore/artifacts/statement.wasm",
  "frozencore/artifacts/guest.wasm",
  "frozencore/artifacts/manifest.json",
  "frozencore/setup/statement/pot_final.ptau",
  "circuit/mini.zkey",
  "keys/verification_key.json",
]);

export function assertOutputAllowed(relPath) {
  const rel = String(relPath).replaceAll("\\", "/");
  if (PROTECTED_REL.includes(rel) || !rel.startsWith("frozencore/dev/")) {
    throw new ProofError("このパスには成果物を書きません", "ARTIFACT");
  }
}

export function resolveVerificationKey(role, mode = "development") {
  refuseProductionFallback(mode);
  if (role === "guest") return ARTIFACTS["guest.vk"];
  if (role === "statement") return ARTIFACTS["statement.vk"];
  throw new ProofError("検証鍵の役割が不明なため、別の鍵へ切り替えません", "ARTIFACT");
}

export function assertVerifierRole(vk, role) {
  const expected = role === "guest" ? 4 : role === "statement" ? 30 : null;
  if (expected === null || vk?.nPublic !== expected) {
    throw new ProofError("検証鍵の公開入力数が回路と一致しないため拒否します", "ARTIFACT");
  }
}

export function activeHashesMatchManifest() {
  const failures = [];
  for (const [manifestName, names] of [
    ["manifest", ["statement.wasm", "statement.r1cs", "statement.zkey", "statement.vk", "statement.ptau"]],
    ["guest.manifest", ["guest.wasm", "guest.r1cs", "guest.zkey", "guest.vk", "guest.ptau"]],
  ]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS[manifestName]), "utf8"));
    if (manifest.production !== false) failures.push(`${manifestName}:production`);
    for (const name of names) {
      const actual = sha256File(path.join(PROJECT_ROOT, ARTIFACTS[name]));
      if (actual !== manifest.artifacts[name]) failures.push(name);
    }
  }
  if (failures.length > 0) {
    throw new ProofError(`成果物ハッシュが manifest と一致しません: ${failures.join(",")}`, "ARTIFACT");
  }
}
