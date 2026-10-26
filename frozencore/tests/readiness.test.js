// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { externalReport } from "../src/external.js";
import { PROJECT_ROOT } from "../src/constants.js";
import { sha256File } from "../../src/integrity/hash.js";
import { assessProductionReadiness, decideReady, UNRESOLVED_TRUST } from "../src/readiness.js";

test("the production gate stays closed and does not promote development keys", async () => {
  const report = await assessProductionReadiness();
  assert.equal(report.ready, false);
  assert.equal(report.production, false);
  assert.equal(report.fallbackToDevelopmentKeys, false);
  assert.deepEqual(report.artifacts.productionApproved, []);
  for (const id of [
    "approved-artifacts",
    "artifact-manifest-hashes",
    "circuit-key-correspondence",
    "ceremony-contributors",
    "ceremony-record-origin",
    "toxic-waste-destruction",
    "toxic-waste-witness-origin",
    "trust-anchors",
    "trust-anchor-wallClock",
    "trust-anchor-revocation",
    "trust-anchor-state",
    "trust-anchor-authorization",
    "trust-anchor-zkvm",
    "trust-anchor-attestation",
    "audit-e2e-record",
    "audit-and-e2e",
    "production-distinct-from-legacy",
  ]) {
    assert.equal(report.unmet.includes(id), true, id);
    assert.equal(report.checks.find((item) => item.id === id).ok, false, id);
    assert.equal(report.checks.find((item) => item.id === id).required, true, id);
  }
  assert.match(report.checks.find((item) => item.id === "trust-anchor-zkvm").evidence, /zkvmProofCommitment/);
  assert.equal(report.checks.find((item) => item.id === "test-verifiers-forbidden").ok, true);
  assert.equal(report.checks.find((item) => item.id === "no-dev-fallback").ok, true);
  assert.equal(report.checks.find((item) => item.id === "dev-keys-not-in-production").ok, true);
  assert.equal(report.checks.find((item) => item.id === "legacy-distinct").ok, true);
  assert.equal(UNRESOLVED_TRUST.length, 6);
  for (const item of UNRESOLVED_TRUST) {
    assert.equal(report.unresolvedTrust.find((entry) => entry.id === item.id).missing.length > 0, true);
  }
});

test("one failed required check keeps the gate closed", () => {
  assert.equal(decideReady([{ id: "a", required: true, ok: true }]), true);
  assert.equal(decideReady([{ id: "a", required: true, ok: true }, { id: "b", required: true, ok: false }]), false);
  assert.equal(decideReady([{ id: "a", required: true, ok: true }, { id: "b", required: false, ok: true }]), false);
  assert.equal(decideReady([]), false);
  assert.equal(decideReady(null), false);
});

test("a mock external success does not configure a trust anchor", () => {
  const report = externalReport({}, {
    allowTestVerifiers: true,
    verifiers: {
      wallClock() {
        return { verified: true, status: "verified", outcome: "verified" };
      },
      revocation() {
        throw new Error("revocation failed");
      },
      state() {
        return { unexpected: true };
      },
      authorization() {
        return "not-an-object";
      },
    },
  });
  assert.equal(report.wallClock.trustAnchor ?? null, null);
  assert.equal(report.wallClock.verified, false);
  assert.equal(report.wallClock.reason, "mock-is-not-verification");
  assert.equal(report.revocation.outcome, "error");
  assert.equal(report.state.outcome, "rejected");
  assert.equal(report.authorization.outcome, "rejected");
  assert.equal(report.authorization.verified, false);
  assert.equal(report.externallyComplete, false);
});

test("self-asserted ceremony files and a claimed test success do not open the gate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frozencore-gate-"));
  try {
    const ceremony = path.join(root, "frozencore", "production", "ceremony");
    fs.mkdirSync(ceremony, { recursive: true });
    for (const name of ["statement.zkey", "guest.zkey", "statement.r1cs", "guest.r1cs", "statement.sym"]) {
      fs.writeFileSync(path.join(root, "frozencore", "production", name), "not-a-production-artifact");
    }
    const digest = sha256File(path.join(root, "frozencore", "production", "statement.zkey"));
    fs.writeFileSync(path.join(root, "frozencore", "production", "manifest.json"), JSON.stringify({
      production: true,
      ceremony: { production: true, contributors: 2 },
      artifacts: { "statement.zkey": digest, "guest.zkey": digest },
    }));
    fs.writeFileSync(path.join(ceremony, "contributors.json"), JSON.stringify([
      { identity: "alice", record: "frozencore/production/ceremony/alice.json" },
      { identity: "alice", record: "../dev/statement/statement.zkey" },
    ]));
    fs.writeFileSync(path.join(ceremony, "alice.json"), JSON.stringify({ identity: "alice", selfAsserted: true }));
    fs.writeFileSync(path.join(ceremony, "destruction.json"), JSON.stringify({
      toxicWasteDestroyed: true,
      method: "deleted",
      witness: "self-asserted",
    }));
    const weak = await assessProductionReadiness({
      root,
      testsPassed: true,
      ceremonyAuthenticated: true,
      toxicWasteAuthenticated: true,
    });
    assert.equal(weak.ready, false);
    assert.equal(weak.production, false);
    assert.deepEqual(weak.artifacts.productionApproved, []);
    for (const id of ["ceremony-contributors", "ceremony-record-origin", "toxic-waste-destruction", "toxic-waste-witness-origin", "artifact-manifest-hashes", "circuit-key-correspondence", "audit-and-e2e", "approved-artifacts"]) {
      assert.equal(weak.checks.find((item) => item.id === id).ok, false, id);
    }

    const hashes = {
      "statement.zkey": digest,
      "guest.zkey": digest,
      "statement.r1cs": digest,
      "guest.r1cs": digest,
    };
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "frozencore", "production", "manifest.json"), "utf8"));
    manifest.artifacts = hashes;
    fs.writeFileSync(path.join(root, "frozencore", "production", "manifest.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(ceremony, "contributors.json"), JSON.stringify([
      { identity: "alice", record: "frozencore/production/ceremony/alice.json" },
      { identity: "bob", record: "frozencore/production/ceremony/bob.json" },
    ]));
    fs.writeFileSync(path.join(ceremony, "alice.json"), JSON.stringify({
      identity: "alice",
      verifier: "verifier-a",
      artifactHashes: hashes,
    }));
    fs.writeFileSync(path.join(ceremony, "bob.json"), JSON.stringify({
      identity: "bob",
      verifier: "verifier-b",
      artifactHashes: hashes,
    }));
    const unsigned = await assessProductionReadiness({ root, ceremonyAuthenticated: true });
    assert.equal(unsigned.checks.find((item) => item.id === "ceremony-contributors").ok, true);
    assert.equal(unsigned.checks.find((item) => item.id === "ceremony-record-origin").ok, false);
    assert.equal(unsigned.checks.find((item) => item.id === "artifact-manifest-hashes").ok, false);
    assert.equal(unsigned.ready, false);
    assert.deepEqual(unsigned.artifacts.productionApproved, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the readiness command exits unready without rewriting artifacts", () => {
  const spawned = spawnSync(process.execPath, ["frozencore/scripts/audit-artifacts.js", "--production-readiness"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  assert.equal(spawned.status, 2);
  const payload = JSON.parse(spawned.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.audit, null);
  assert.equal(payload.readiness.ready, false);
  assert.equal(payload.readiness.artifacts.productionApproved.length, 0);
});
