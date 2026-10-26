// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sha256Bytes } from "../../src/integrity/hash.js";

export const EVIDENCE_REL = "frozencore/evidence/audit-e2e.json";
export const EVIDENCE_SCHEMA = "frozencore-audit-e2e-record-v1";

export const REQUIRED_COMMANDS = Object.freeze([
  "node --test --test-force-exit frozencore/tests/*.test.js",
  "node frozencore/scripts/audit-artifacts.js",
  "node frozencore/scripts/audit-artifacts.js --rebuild",
  "node frozencore/scripts/keys-check.js",
  "npm test",
]);

export const EVIDENCE_ARTIFACTS = Object.freeze([
  "frozencore/dev/guest/guest.wasm",
  "frozencore/dev/guest/guest.r1cs",
  "frozencore/dev/guest/guest.zkey",
  "frozencore/dev/guest/verification_key.json",
  "frozencore/dev/guest/manifest.json",
  "frozencore/dev/statement/statement.wasm",
  "frozencore/dev/statement/statement.r1cs",
  "frozencore/dev/statement/statement.zkey",
  "frozencore/dev/statement/verification_key.json",
  "frozencore/dev/statement/manifest.json",
  "frozencore/artifacts/statement.zkey",
  "frozencore/artifacts/statement.r1cs",
  "frozencore/keys/statement_verification_key.json",
  "frozencore/artifacts/guest.r1cs",
  "circuit/mini.zkey",
  "keys/verification_key.json",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function auditEvidenceBodyHash(record) {
  const body = { ...record };
  delete body.bodySha256;
  delete body.signature;
  return sha256Text(canonical(body));
}

function safeRelative(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0 || path.isAbsolute(relPath)) return false;
  if (relPath.includes("\\") || relPath.includes("\0") || relPath.split("/").includes("..")) return false;
  return true;
}

export function readGitCommit(root) {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const text = (result.stdout || "").trim();
    if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.ino !== 0;
}

function readRegularFileSafely(filePath) {
  let fd;

  try {
    const flags =
      fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0);

    // Open first; avoid checking the path before opening it.
    fd = fs.openSync(filePath, flags);

    const opened = fs.fstatSync(fd);
    if (!opened.isFile()) {
      return { status: "rejected" };
    }

    const data = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);

    if (
      !sameFileIdentity(opened, after) ||
      opened.size !== after.size ||
      opened.mtimeMs !== after.mtimeMs ||
      opened.ctimeMs !== after.ctimeMs
    ) {
      return { status: "rejected" };
    }

    const current = fs.lstatSync(filePath);
    if (
      current.isSymbolicLink() ||
      !current.isFile() ||
      !sameFileIdentity(opened, current)
    ) {
      return { status: "rejected" };
    }

    return { status: "ok", data };
  } catch (error) {
    return error?.code === "ENOENT"
      ? { status: "missing" }
      : { status: "rejected" };
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

export function loadAuditEvidence(root) {
  const filePath = path.join(root, EVIDENCE_REL);
  const result = readRegularFileSafely(filePath);

  if (result.status === "missing") {
    return { present: false, rejected: false, record: null };
  }
  if (result.status !== "ok") {
    return { present: true, rejected: true, record: null };
  }

  try {
    const record = JSON.parse(result.data.toString("utf8"));
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { present: true, rejected: true, record: null };
    }
    return { present: true, rejected: false, record };
  } catch {
    return { present: true, rejected: true, record: null };
  }
}

function artifactHashes(root) {
  const hashes = {};
  for (const relPath of EVIDENCE_ARTIFACTS) {
    const result = readRegularFileSafely(path.join(root, relPath));
    if (result.status !== "ok") return null;
    hashes[relPath] = sha256Bytes(result.data);
  }
  return hashes;
}


export function verifyAuditEvidence(loaded, context = {}) {
  const failures = [];
  const record = loaded?.record;
  if (!loaded?.present || loaded.rejected || !record) {
    failures.push(loaded?.rejected ? "evidence-rejected" : "evidence-missing");
  } else {
    if (record.schema !== EVIDENCE_SCHEMA) failures.push("schema");
    if (typeof record.commit !== "string" || record.commit !== context.commit) failures.push("commit");
    if (typeof record.recordedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(record.recordedAt)) {
      failures.push("recorded-at");
    }
    if (!Array.isArray(record.commands)) failures.push("commands");
    else {
      const seen = new Map();
      for (const item of record.commands) {
        if (typeof item?.command !== "string" || !Number.isInteger(item.exitCode) || !Number.isInteger(item.failed)) {
          failures.push("command-shape");
          continue;
        }
        seen.set(item.command, item);
      }
      for (const command of REQUIRED_COMMANDS) {
        const item = seen.get(command);
        if (!item) failures.push("command-missing");
        else if (item.exitCode !== 0 || item.failed !== 0) failures.push("command-failed");
      }
      for (const command of seen.keys()) {
        if (!REQUIRED_COMMANDS.includes(command)) failures.push("command-unexpected");
      }
    }
    const claimed = record.artifacts;
    const actual = context.artifactHashes ?? null;
    if (!claimed || typeof claimed !== "object" || Array.isArray(claimed) || !actual) failures.push("artifacts");
    else {
      const claimedKeys = Object.keys(claimed);
      if (claimedKeys.length !== EVIDENCE_ARTIFACTS.length || claimedKeys.some((key) => !safeRelative(key))) {
        failures.push("artifact-keys");
      }
      for (const relPath of EVIDENCE_ARTIFACTS) {
        if (claimed[relPath] !== actual[relPath]) failures.push("artifact-hash");
      }
    }
    if (typeof record.bodySha256 !== "string" || record.bodySha256 !== auditEvidenceBodyHash(record)) failures.push("body-sha256");
    if (record.testsPassed !== undefined) failures.push("self-reported-success");
  }
  return {
    consistent: failures.length === 0,
    authenticated: false,
    authenticationReason: "no-configured-evidence-trust-anchor",
    independence: "in-repo-record-does-not-prove-external-independence",
    failures,
  };
}

export function assessAuditEvidence(root, commit = readGitCommit(root)) {
  const loaded = loadAuditEvidence(root);
  if (!loaded.present || loaded.rejected) return verifyAuditEvidence(loaded, { commit });
  return verifyAuditEvidence(loaded, { commit, artifactHashes: artifactHashes(root) });
}
