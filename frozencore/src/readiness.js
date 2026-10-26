// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import { sha256File } from "../../src/integrity/hash.js";
import { assessAuditEvidence } from "./audit-evidence.js";
import { externalReport } from "./external.js";
import { ARTIFACTS, GUEST_PUBLIC_SIGNALS, PROJECT_ROOT, PUBLIC_SIGNALS } from "./constants.js";
import {
  LEGACY_GUEST_R1CS,
  LEGACY_STATEMENT_R1CS,
  LEGACY_STATEMENT_VK,
  LEGACY_STATEMENT_ZKEY,
  refuseProductionFallback,
} from "./keys.js";

export const UNRESOLVED_TRUST = Object.freeze([
  Object.freeze({
    id: "wallClock",
    verifies: "expiresAt against a trusted clock",
    missing: ["clock identity", "allowed skew", "replay window"],
  }),
  Object.freeze({
    id: "revocation",
    verifies: "absence from a trusted revocation set",
    missing: ["authority identity", "signed set", "update and expiry rule"],
  }),
  Object.freeze({
    id: "state",
    verifies: "subject state against a trusted root",
    missing: ["state authority", "root signature", "freshness rule"],
  }),
  Object.freeze({
    id: "authorization",
    verifies: "a signature under a trusted scheme and key",
    missing: ["signature scheme", "trusted key", "message binding"],
  }),
  Object.freeze({
    id: "zkvm",
    verifies: "a ZKVM execution proof",
    missing: ["zkvm verifier", "program identity", "journal binding"],
  }),
  Object.freeze({
    id: "attestation",
    verifies: "a hardware attestation quote",
    missing: ["attestation trust anchor", "measurement policy", "quote freshness"],
  }),
]);

function check(checks, id, ok, detail, evidence) {
  checks.push({
    id,
    ok: ok === true,
    required: true,
    detail,
    evidence,
  });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const PRODUCTION_FILES = Object.freeze([
  "statement.wasm",
  "statement.r1cs",
  "statement.ptau",
  "statement.zkey",
  "statement.vk",
  "statement.sym",
  "guest.wasm",
  "guest.r1cs",
  "guest.ptau",
  "guest.zkey",
  "guest.vk",
  "guest.sym",
]);

function productionPath(root, name) {
  return path.join(root, "frozencore", "production", name);
}

function regularFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function distinctFiles(root, left, right) {
  const leftPath = path.join(root, left);
  const rightPath = path.join(root, right);
  if (!regularFile(leftPath) || !regularFile(rightPath)) return false;
  return sha256File(leftPath) !== sha256File(rightPath);
}

function confinedProduction(root, relPath) {
  if (typeof relPath !== "string" || relPath.length === 0 || path.isAbsolute(relPath)) return null;
  if (relPath.includes("\\") || relPath.includes("\0")) return null;
  const base = path.resolve(root, "frozencore", "production");
  const full = path.resolve(root, relPath);
  const relative = path.relative(base, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return full;
}

function manifestHashesMatch(root, manifest) {
  const artifacts = manifest?.artifacts;
  if (!artifacts || typeof artifacts !== "object") return false;
  for (const name of PRODUCTION_FILES) {
    const claimed = artifacts[name];
    const filePath = productionPath(root, name);
    if (typeof claimed !== "string" || !/^[0-9a-f]{64}$/.test(claimed)) return false;
    if (!regularFile(filePath) || sha256File(filePath) !== claimed) return false;
  }
  return true;
}

function publicNames(symPath, count) {
  try {
    const lines = fs.readFileSync(symPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length < count) return null;
    return lines.slice(0, count).map((line) => line.split(",").at(-1).replace(/^main\./, ""));
  } catch {
    return null;
  }
}

async function circuitCorrespondence(root, manifest) {
  if (!manifestHashesMatch(root, manifest)) return false;
  const guestNames = publicNames(productionPath(root, "guest.sym"), GUEST_PUBLIC_SIGNALS.length);
  const statementNames = publicNames(productionPath(root, "statement.sym"), PUBLIC_SIGNALS.length);
  if (!guestNames || guestNames.join(",") !== GUEST_PUBLIC_SIGNALS.join(",")) return false;
  if (!statementNames || statementNames.join(",") !== PUBLIC_SIGNALS.join(",")) return false;
  let library;
  try {
    library = await import("snarkjs");
  } catch {
    return false;
  }
  for (const role of [
    { id: "guest", publicInputs: GUEST_PUBLIC_SIGNALS.length },
    { id: "statement", publicInputs: PUBLIC_SIGNALS.length },
  ]) {
    const saved = readJson(productionPath(root, `${role.id}.vk`));
    let verified = false;
    let exported = null;
    try {
      verified = await library.zKey.verifyFromR1cs(
        productionPath(root, `${role.id}.r1cs`),
        productionPath(root, `${role.id}.ptau`),
        productionPath(root, `${role.id}.zkey`),
      );
      exported = await library.zKey.exportVerificationKey(productionPath(root, `${role.id}.zkey`));
    } catch {
      verified = false;
    }
    if (verified !== true || !saved || !exported) return false;
    if (saved.nPublic !== role.publicInputs || exported.nPublic !== role.publicInputs) return false;
    if (saved.protocol !== "groth16" || saved.curve !== "bn128") return false;
    if (JSON.stringify(saved.IC) !== JSON.stringify(exported.IC)) return false;
  }
  return true;
}

function contributorContentOk(root, contributors, manifest) {
  if (!Array.isArray(contributors) || contributors.length < 2) return false;
  const identities = [];
  const records = [];
  for (const item of contributors) {
    if (typeof item?.identity !== "string" || item.identity.length === 0) return false;
    if (typeof item?.record !== "string") return false;
    identities.push(item.identity);
    records.push(item.record);
    const full = confinedProduction(root, item.record);
    if (!full || !regularFile(full)) return false;
    const body = readJson(full);
    if (!body || body.identity !== item.identity || body.selfAsserted === true) return false;
    if (typeof body.verifier !== "string" || body.verifier.length === 0 || body.verifier === item.identity) return false;
    const hashes = body.artifactHashes;
    if (!hashes || typeof hashes !== "object") return false;
    for (const name of ["statement.zkey", "guest.zkey", "statement.r1cs", "guest.r1cs"]) {
      const filePath = productionPath(root, name);
      if (typeof hashes[name] !== "string" || !regularFile(filePath)) return false;
      if (sha256File(filePath) !== hashes[name]) return false;
      if (manifest?.artifacts?.[name] !== hashes[name]) return false;
    }
  }
  return new Set(identities).size === identities.length && new Set(records).size === records.length;
}

function destructionContentOk(root, destruction, contributors) {
  if (!destruction || destruction.toxicWasteDestroyed !== true) return false;
  if (typeof destruction.method !== "string" || destruction.method.length === 0) return false;
  if (destruction.witness === "self-asserted" || destruction.selfAsserted === true) return false;
  if (!Array.isArray(contributors) || contributors.length < 2) return false;
  if (!Array.isArray(destruction.witnesses) || destruction.witnesses.length !== contributors.length) return false;
  const seen = new Set();
  for (const witness of destruction.witnesses) {
    if (typeof witness?.identity !== "string" || typeof witness.file !== "string") return false;
    if (seen.has(witness.identity)) return false;
    seen.add(witness.identity);
    const full = confinedProduction(root, witness.file);
    if (!full || !regularFile(full)) return false;
    const body = readJson(full);
    if (!body || body.identity !== witness.identity || body.destroyed !== true || body.selfAsserted === true) return false;
  }
  return contributors.every((item) => seen.has(item?.identity));
}

export function decideReady(checks) {
  return Array.isArray(checks) && checks.length > 0 && checks.every((item) => item?.required === true && item.ok === true);
}

export async function assessProductionReadiness(options = {}) {
  const root = options.root ?? PROJECT_ROOT;
  const checks = [];
  const productionManifest = path.join(root, "frozencore/production/manifest.json");
  const destructionRecord = path.join(root, "frozencore/production/ceremony/destruction.json");
  const contributorRecord = path.join(root, "frozencore/production/ceremony/contributors.json");
  const manifest = readJson(productionManifest);
  const contributors = readJson(contributorRecord);
  const hashOk = manifestHashesMatch(root, manifest);
  const productionStatement = "frozencore/production/statement.zkey";
  const productionGuest = "frozencore/production/guest.zkey";
  const distinctFromDev = distinctFiles(root, ARTIFACTS["statement.zkey"], productionStatement)
    && distinctFiles(root, ARTIFACTS["guest.zkey"], productionGuest);
  const approved = manifest?.production === true
    && manifest?.ceremony?.production === true
    && Number.isInteger(manifest?.ceremony?.contributors)
    && manifest.ceremony.contributors >= 2
    && hashOk === true
    && distinctFromDev === true;
  check(
    checks,
    "approved-artifacts",
    approved === true,
    "本番用として承認された成果物は無い",
    "frozencore/production に、開発用 zkey とは別で、マニフェストのハッシュと一致する本番成果物が必要",
  );
  check(
    checks,
    "artifact-manifest-hashes",
    hashOk === true,
    "本番成果物とマニフェストのハッシュは一致していない",
    "statement と guest の wasm、r1cs、ptau、zkey、verification key、sym を通常ファイルとしてハッシュ照合する",
  );
  const corresponded = await circuitCorrespondence(root, manifest);
  check(
    checks,
    "circuit-key-correspondence",
    corresponded === true,
    "回路、R1CS、zkey、verification key の対応は検証されていない",
    "公開信号の順序、verifyFromR1cs、書き出した検証鍵の IC が一致する必要がある。検証鍵ファイルの存在だけでは認定しない",
  );

  const productionDir = path.join(root, "frozencore/production");
  let mixed = false;
  if (fs.existsSync(productionDir)) {
    const devHashes = new Set();
    for (const relPath of [ARTIFACTS["statement.zkey"], ARTIFACTS["guest.zkey"], ARTIFACTS["statement.vk"], ARTIFACTS["guest.vk"]]) {
      const full = path.join(root, relPath);
      if (regularFile(full)) devHashes.add(sha256File(full));
    }
    const stack = [productionDir];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        mixed = true;
        break;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isSymbolicLink()) mixed = true;
        else if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) {
          try {
            if (devHashes.has(sha256File(full))) mixed = true;
          } catch {
            mixed = true;
          }
        }
      }
    }
  }
  check(checks, "dev-keys-not-in-production", mixed === false, mixed ? "開発用鍵が本番ディレクトリにある" : "本番ディレクトリに開発用鍵は無い", "本番ディレクトリへ開発用鍵をコピーしない");

  const contributorOk = contributorContentOk(root, contributors, manifest);
  check(checks, "ceremony-contributors", contributorOk === true, "複数貢献者の独立検証記録は無い", "異なる本人と検証者、成果物ハッシュを含む記録。ファイルの存在だけでは足りない");
  check(
    checks,
    "ceremony-record-origin",
    false,
    "貢献者記録の出所を検証する署名方式は未定",
    "実在する複数の参加者と、方式が定まった独立検証者の署名。JSON の自己申告は出所の検証ではない",
  );

  const destruction = readJson(destructionRecord);
  const destructionOk = destructionContentOk(root, destruction, contributors);
  check(checks, "toxic-waste-destruction", destructionOk === true, "toxic waste の破棄記録は無い", "貢献者ごとの証跡ファイル。運営者の自己申告だけでは足りない");
  check(
    checks,
    "toxic-waste-witness-origin",
    false,
    "破棄証跡の検証方式は未定",
    "記録の存在や toxicWasteDestroyed の真偽値を、破棄の証明にはしない",
  );

  const external = externalReport({}, { mode: "production", allowTestVerifiers: true, verifiers: { zkvm() { return { verified: true, status: "verified", outcome: "verified" }; } } });
  const anchorsConfigured = UNRESOLVED_TRUST.every((item) => {
    const result = external[item.id];
    return result?.trustAnchor && typeof result.trustAnchor === "object" && result.verified === true && result.mock !== true;
  });
  check(checks, "trust-anchors", anchorsConfigured === true, "外部 trust anchor は未設定", "6 項目それぞれの信頼元。戻り値の verified だけでは足りない");
  for (const item of UNRESOLVED_TRUST) {
    const result = external[item.id];
    const configured = result?.trustAnchor && typeof result.trustAnchor === "object" && result.verified === true && result.mock !== true;
    const extra = item.id === "zkvm"
      ? " zkvmProofCommitment の一致は ZKVM 証明の検証ではない。"
      : item.id === "attestation"
        ? " attestation のハッシュ一致は quote の検証ではない。"
        : item.id === "authorization"
          ? " 署名値のハッシュは署名検証ではない。"
          : "";
    check(
      checks,
      `trust-anchor-${item.id}`,
      configured === true,
      `${item.id} の trust anchor は未設定`,
      `検証対象: ${item.verifies}。未設定: ${item.missing.join(", ")}。失敗時は verified false。テスト検証器は本番モードで呼び出さない。${extra}`,
    );
  }
  check(
    checks,
    "test-verifiers-forbidden",
    external.zkvm?.reason === "test-verifier-forbidden" && external.zkvm?.verified !== true,
    "本番モードのテスト検証器の扱い",
    "本番モードではテスト検証器を拒否する",
  );

  let fallbackRefused = false;
  try {
    refuseProductionFallback("production");
  } catch {
    fallbackRefused = true;
  }
  check(checks, "no-dev-fallback", fallbackRefused === true, "本番モードで開発用鍵へ戻らない", "本番鍵が無いとき開発用鍵を使わない");

  const legacyDistinct = distinctFiles(root, ARTIFACTS["statement.zkey"], LEGACY_STATEMENT_ZKEY)
    && distinctFiles(root, ARTIFACTS["statement.r1cs"], LEGACY_STATEMENT_R1CS)
    && distinctFiles(root, ARTIFACTS["statement.vk"], LEGACY_STATEMENT_VK)
    && distinctFiles(root, ARTIFACTS["guest.r1cs"], LEGACY_GUEST_R1CS);
  check(checks, "legacy-distinct", legacyDistinct === true, "現行の開発用成果物とレガシー成果物は別物", "レガシー鍵を本番鍵として使わない");
  const productionDistinct = ["statement.zkey", "statement.r1cs", "statement.vk", "guest.r1cs"].every((name) => {
    const legacy = {
      "statement.zkey": LEGACY_STATEMENT_ZKEY,
      "statement.r1cs": LEGACY_STATEMENT_R1CS,
      "statement.vk": LEGACY_STATEMENT_VK,
      "guest.r1cs": LEGACY_GUEST_R1CS,
    }[name];
    return distinctFiles(root, `frozencore/production/${name}`, legacy);
  });
  check(
    checks,
    "production-distinct-from-legacy",
    productionDistinct === true,
    "本番成果物がレガシー成果物と別であることは確認できない",
    "本番ファイルが無い、またはレガシーと同一なら現行の本番成果物として扱わない",
  );

  const evidence = assessAuditEvidence(root);
  check(
    checks,
    "audit-e2e-record",
    evidence.consistent === true,
    "監査と E2E の実行記録が、対象コミットと成果物ハッシュに一致しない",
    "frozencore/evidence/audit-e2e.json に、コマンド、終了コード、失敗数 0、成果物 SHA-256、コミット、記録時刻、bodySha256 が必要。testsPassed の自己申告は拒否する",
  );
  check(
    checks,
    "audit-and-e2e",
    evidence.consistent === true && evidence.authenticated === true,
    "監査と E2E の記録は、外部の独立性までは証明しない",
    "同一リポジトリ内の記録は改ざんと欠落を検査できる。署名または独立した CI の信頼元が未設定なので、記録の存在を外部検証とは扱わない",
  );

  const guestManifest = readJson(path.join(root, ARTIFACTS["guest.manifest"]));
  const statementManifest = readJson(path.join(root, ARTIFACTS.manifest));
  const labeledDev = guestManifest?.production === false
    && statementManifest?.production === false
    && guestManifest?.ceremony?.production === false
    && statementManifest?.ceremony?.production === false;
  check(checks, "development-keys-labeled", labeledDev === true, "開発用マニフェストは production false", "開発用成果物を本番承認済みと表示しない");

  const unmet = checks.filter((item) => item.ok !== true).map((item) => item.id);
  const ready = decideReady(checks);
  return {
    ready,
    production: false,
    fallbackToDevelopmentKeys: false,
    checks,
    unmet,
    evidenceRequired: checks.filter((item) => item.ok !== true).map((item) => ({ id: item.id, evidence: item.evidence })),
    unresolvedTrust: UNRESOLVED_TRUST,
    artifacts: {
      development: [ARTIFACTS["guest.zkey"], ARTIFACTS["statement.zkey"]],
      legacy: [LEGACY_GUEST_R1CS, LEGACY_STATEMENT_ZKEY, LEGACY_STATEMENT_VK],
      productionApproved: ready === true ? [productionStatement, productionGuest] : [],
      unverified: "開発用セレモニーの成果物は本番承認ではない",
    },
  };
}
