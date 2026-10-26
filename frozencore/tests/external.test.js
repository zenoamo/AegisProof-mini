// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkAttestation,
  checkAuthorization,
  checkRevocation,
  checkState,
  checkTimeOrder,
  checkWallClock,
  checkZkvm,
  externalReport,
  isExternallyComplete,
  rootsEqual,
} from "../src/external.js";
import { reviewStatement } from "../src/review.js";
import { SAMPLE_PARTS } from "../src/sample.js";
import { statementFromParts } from "../src/statement.js";

test("time order is not a wall-clock check", () => {
  assert.equal(checkTimeOrder(1000n, 1000n).status, "rejected");
  assert.equal(checkTimeOrder(1000n, 1001n).status, "order-only");
  assert.equal(checkTimeOrder(1000n, 1001n).verified, false);
  assert.equal(checkTimeOrder(1001n, 1000n).reason, "issuedAt-not-before-expiresAt");
  assert.equal(checkTimeOrder("010", "11").status, "malformed");
  const clock = checkWallClock({ now: 1000n });
  assert.equal(clock.status, "not-configured");
  assert.equal(clock.verified, false);
});

test("a matching root is not a revocation or state decision", () => {
  assert.equal(rootsEqual("10", "10"), true);
  assert.equal(rootsEqual("10", "11"), false);
  assert.equal(checkRevocation({ claimed: "10", trusted: "10" }).verified, false);
  assert.equal(checkRevocation().status, "not-configured");
  assert.equal(checkState({ claimed: "10", trusted: "10" }).status, "not-configured");
});

test("commitment equality does not verify signatures, zkvm proofs, or attestations", () => {
  const authorization = checkAuthorization({ publicKey: "abcd", signature: "ffff", message: "policy" });
  assert.equal(authorization.verified, false);
  assert.equal(authorization.status, "not-configured");
  const zkvm = checkZkvm({ claimed: "55", computed: "55", proof: { protocol: "groth16" } });
  assert.equal(zkvm.commitmentMatch, true);
  assert.equal(zkvm.verified, false);
  const attestation = checkAttestation({ claimed: "77", observed: "77", quote: "not-a-quote" });
  assert.equal(attestation.digestMatch, true);
  assert.equal(attestation.verified, false);
  assert.equal(checkZkvm({ claimed: "55", computed: "56" }).commitmentMatch, false);
});

test("the shipped external report stays incomplete and calls no service", async () => {
  const statement = await statementFromParts(SAMPLE_PARTS);
  const report = externalReport({
    issuedAt: statement.publicSignals[11],
    expiresAt: statement.publicSignals[12],
  });
  assert.equal(report.timeOrder.status, "order-only");
  assert.equal(report.wallClock.verified, false);
  assert.equal(report.revocation.verified, false);
  assert.equal(report.authorization.verified, false);
  assert.equal(report.zkvm.verified, false);
  assert.equal(report.attestation.verified, false);
  assert.equal(report.service.invoked, false);
  assert.equal(report.service.timedOut, false);
  assert.equal(report.externallyComplete, false);
  const reviewed = await reviewStatement({ publicSignals: statement.publicSignals });
  assert.equal(reviewed.groth16, false);
  assert.equal(reviewed.externallyComplete, false);
  assert.equal(reviewed.verified, false);
});

test("external completion stays false when a result is missing, errored, or only partial", () => {
  const report = externalReport({ issuedAt: "1000", expiresAt: "5000" });
  assert.equal(report.mode, "development");
  assert.equal(report.mock, false);
  assert.equal(report.timeOrder.verified, false);
  assert.equal(isExternallyComplete(report), false);
  assert.equal(isExternallyComplete(null), false);
  const missing = { ...report };
  delete missing.attestation;
  assert.equal(isExternallyComplete(missing), false);
  const errored = { ...report, zkvm: { verified: false, status: "error", reason: "check-failed" } };
  assert.equal(isExternallyComplete(errored), false);
  const one = { ...report, wallClock: { verified: true, status: "verified" } };
  assert.equal(isExternallyComplete(one), false);
  const production = externalReport({}, { mode: "production" });
  assert.equal(production.mode, "production");
  assert.equal(production.externallyComplete, false);
});

test("unset, rejected, thrown, and missing external checks do not complete", () => {
  const unset = externalReport({ issuedAt: "1000", expiresAt: "5000" });
  for (const name of ["wallClock", "revocation", "state", "authorization", "zkvm", "attestation"]) {
    assert.equal(unset[name].outcome, "not-configured");
    assert.equal(unset[name].verified, false);
    assert.equal(unset[name].trustAnchor, null);
  }
  const rejected = externalReport({}, {
    allowTestVerifiers: true,
    verifiers: { wallClock() { return { verified: false, status: "rejected", reason: "expired" }; } },
  });
  assert.equal(rejected.wallClock.outcome, "rejected");
  assert.equal(rejected.externallyComplete, false);
  const thrown = externalReport({}, {
    allowTestVerifiers: true,
    verifiers: { revocation() { throw new Error("boom"); } },
  });
  assert.equal(thrown.revocation.outcome, "error");
  assert.equal(thrown.externallyComplete, false);
  const missing = externalReport({}, {
    allowTestVerifiers: true,
    verifiers: { state() { return null; } },
  });
  assert.equal(missing.state.outcome, "missing");
  assert.equal(missing.externallyComplete, false);
  const forbidden = externalReport({}, {
    mode: "production",
    allowTestVerifiers: true,
    verifiers: { zkvm() { return { verified: true, status: "verified", outcome: "verified" }; } },
  });
  assert.equal(forbidden.zkvm.outcome, "error");
  assert.equal(forbidden.zkvm.reason, "test-verifier-forbidden");
  assert.equal(forbidden.externallyComplete, false);
  const mockSuccess = externalReport({}, {
    allowTestVerifiers: true,
    verifiers: {
      wallClock() { return { verified: true, status: "verified", outcome: "verified" }; },
      revocation() { return { verified: true, status: "verified", outcome: "verified" }; },
      state() { return { verified: true, status: "verified", outcome: "verified" }; },
      authorization() { return { verified: true, status: "verified", outcome: "verified" }; },
      zkvm() { return { verified: true, status: "verified", outcome: "verified" }; },
      attestation() { return { verified: true, status: "verified", outcome: "verified" }; },
    },
  });
  assert.equal(mockSuccess.externallyComplete, false);
  assert.equal(mockSuccess.wallClock.verified, false);
});
