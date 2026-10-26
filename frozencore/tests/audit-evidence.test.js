// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";
import {
  EVIDENCE_ARTIFACTS,
  EVIDENCE_SCHEMA,
  REQUIRED_COMMANDS,
  assessAuditEvidence,
  auditEvidenceBodyHash,
  verifyAuditEvidence,
} from "../src/audit-evidence.js";
import { PROJECT_ROOT } from "../src/constants.js";
import { assessProductionReadiness } from "../src/readiness.js";

const COMMIT = "a".repeat(40);

function matchingContext(record) {
  return { commit: COMMIT, artifactHashes: { ...record.artifacts } };
}

function validRecord() {
  const record = {
    schema: EVIDENCE_SCHEMA,
    commit: COMMIT,
    recordedAt: "2026-10-09T07:00:00Z",
    commands: REQUIRED_COMMANDS.map((command) => ({ command, exitCode: 0, failed: 0 })),
    artifacts: Object.fromEntries(EVIDENCE_ARTIFACTS.map((relPath) => [relPath, "ab".repeat(32)])),
  };
  record.bodySha256 = auditEvidenceBodyHash(record);
  return record;
}

test("a matching unsigned audit record is not external attestation", () => {
  const record = validRecord();
  const report = verifyAuditEvidence({ present: true, rejected: false, record }, matchingContext(record));
  assert.equal(report.consistent, true);
  assert.equal(report.authenticated, false);
  assert.equal(report.authenticationReason, "no-configured-evidence-trust-anchor");
  assert.equal(report.independence, "in-repo-record-does-not-prove-external-independence");
});

test("tampered hashes, commits, commands, and self-reported success are rejected", () => {
  const missing = verifyAuditEvidence({ present: false, rejected: false, record: null }, { commit: COMMIT });
  assert.equal(missing.consistent, false);
  assert.equal(missing.failures.includes("evidence-missing"), true);

  const rejected = verifyAuditEvidence({ present: true, rejected: true, record: null }, { commit: COMMIT });
  assert.equal(rejected.failures.includes("evidence-rejected"), true);

  const tampered = validRecord();
  tampered.artifacts[EVIDENCE_ARTIFACTS[0]] = "cd".repeat(32);
  tampered.bodySha256 = auditEvidenceBodyHash(tampered);
  const hashReport = verifyAuditEvidence(
    { present: true, rejected: false, record: tampered },
    { commit: COMMIT, artifactHashes: Object.fromEntries(EVIDENCE_ARTIFACTS.map((relPath) => [relPath, "ab".repeat(32)])) },
  );
  assert.equal(hashReport.consistent, false);
  assert.equal(hashReport.failures.includes("artifact-hash"), true);

  const checksum = validRecord();
  checksum.commands[0].exitCode = 1;
  const checksumReport = verifyAuditEvidence({ present: true, rejected: false, record: checksum }, matchingContext(validRecord()));
  assert.equal(checksumReport.consistent, false);
  assert.equal(checksumReport.failures.includes("body-sha256"), true);

  const otherCommit = validRecord();
  const commitReport = verifyAuditEvidence(
    { present: true, rejected: false, record: otherCommit },
    { commit: "b".repeat(40), artifactHashes: { ...otherCommit.artifacts } },
  );
  assert.equal(commitReport.failures.includes("commit"), true);

  const claimed = validRecord();
  claimed.testsPassed = true;
  claimed.bodySha256 = auditEvidenceBodyHash(claimed);
  const claimedReport = verifyAuditEvidence({ present: true, rejected: false, record: claimed }, matchingContext(claimed));
  assert.equal(claimedReport.consistent, false);
  assert.equal(claimedReport.failures.includes("self-reported-success"), true);

  const escaped = validRecord();
  escaped.artifacts["../circuit/mini.zkey"] = escaped.artifacts["circuit/mini.zkey"];
  delete escaped.artifacts["circuit/mini.zkey"];
  escaped.bodySha256 = auditEvidenceBodyHash(escaped);
  const escapedReport = verifyAuditEvidence({ present: true, rejected: false, record: escaped }, matchingContext(validRecord()));
  assert.equal(escapedReport.consistent, false);
});

test("the repository has no audit evidence file and a caller flag cannot create one", async () => {
  const evidence = assessAuditEvidence(PROJECT_ROOT);
  assert.equal(evidence.consistent, false);
  assert.equal(evidence.authenticated, false);
  const report = await assessProductionReadiness({ testsPassed: true, auditEvidenceAuthenticated: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === "audit-e2e-record").ok, false);
  assert.equal(report.checks.find((item) => item.id === "audit-and-e2e").ok, false);
});
