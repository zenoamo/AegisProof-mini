// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";
import { GUEST_PUBLIC_SIGNALS, PUBLIC_SIGNALS } from "../src/constants.js";
import { InputError } from "../src/errors.js";
import { proveGuest } from "../src/guest-prove.js";
import { verifyGuest } from "../src/guest-verify.js";
import { prove } from "../src/prove.js";
import { reviewPair, REVIEW_LIMITS, statementBindings } from "../src/review.js";
import { SAMPLE_PARTS } from "../src/sample.js";
import { statementFromParts } from "../src/statement.js";
import { verify } from "../src/verify.js";

const pair = (async () => {
  const guest = await proveGuest({
    inputSecret: SAMPLE_PARTS.inputSecret,
    inputSalt: SAMPLE_PARTS.inputSalt,
    executionId: SAMPLE_PARTS.executionId,
  });
  const statement = await prove(SAMPLE_PARTS);
  return { guest, statement };
})();

function flipProof(envelope) {
  const copy = structuredClone(envelope);
  copy.proof.pi_a[0] = copy.proof.pi_a[0].replace(/[0-9]/, (digit) => (digit === "1" ? "2" : "1"));
  return copy;
}

function flags(report) {
  return {
    proofsValid: report.proofsValid,
    publicMatch: report.publicMatch,
    bindingsValid: report.bindingsValid,
    externallyComplete: report.externallyComplete,
    verified: report.verified,
  };
}

test("guest and statement proofs verify and review stays externally incomplete", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  assert.deepEqual(guest.signalNames, [...GUEST_PUBLIC_SIGNALS]);
  assert.deepEqual(statement.signalNames, [...PUBLIC_SIGNALS]);
  assert.equal(guest.publicSignals.length, 4);
  assert.equal(statement.publicSignals.length, 30);
  assert.equal(await verifyGuest(guest), true);
  assert.equal(await verify(statement), true);
  const report = await reviewPair(guest, statement);
  assert.deepEqual(flags(report), {
    proofsValid: true,
    publicMatch: true,
    bindingsValid: true,
    externallyComplete: false,
    verified: false,
  });
  assert.equal(report.guest, true);
  assert.equal(report.statement, true);
  assert.equal(report.bindings.programVersionIsOne, true);
  assert.equal(report.bindings.zkvmTupleBound, true);
  assert.equal(report.limits.zkvmTupleIsNotAZkvmVerifier, true);
  assert.equal(report.limits.publicMatchIsNotAProof, true);
  assert.equal(report.limits.externalAuthoritiesConfigured, false);
  assert.equal(REVIEW_LIMITS.externalAuthoritiesConfigured, false);
  for (const name of ["wallClock", "revocation", "state", "authorization", "zkvm", "attestation"]) {
    assert.equal(report.external[name].trustAnchor, null);
    assert.equal(report.external[name].verified, false);
    assert.equal(report.external[name].outcome, "not-configured");
  }
  assert.equal(report.external.zkvm.reason, "no-zkvm-verifier");
  assert.equal(report.external.attestation.reason, "no-attestation-trust-anchor");
  assert.equal(report.external.wallClock.wallClockCompared, false);
});

test("guest proof failures are rejected at verification", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const badProof = await reviewPair(flipProof(guest), statement);
  assert.equal(badProof.guest, false);
  assert.equal(badProof.proofsValid, false);
  assert.equal(badProof.publicMatch, true);
  assert.equal(badProof.verified, false);

  const changed = structuredClone(guest);
  const index = changed.signalNames.indexOf("executionId");
  changed.publicSignals[index] = changed.publicSignals[index] === "1" ? "2" : "1";
  assert.equal(await verifyGuest(changed), false);
  const changedReport = await reviewPair(changed, statement);
  assert.equal(changedReport.publicMatch, false);
  assert.equal(changedReport.proofsValid, false);
  assert.equal(changedReport.verified, false);

  const short = structuredClone(guest);
  short.publicSignals = guest.publicSignals.slice(0, 3);
  assert.equal(await verifyGuest(short), false);
  const reordered = structuredClone(guest);
  reordered.signalNames = [...guest.signalNames].reverse();
  assert.equal(await verifyGuest(reordered), false);
});

test("a second valid guest execution does not match the statement", { timeout: 180000 }, async () => {
  const { statement } = await pair;
  const other = await proveGuest({ inputSecret: "8", inputSalt: "2", executionId: "7" });
  assert.equal(await verifyGuest(other), true);
  assert.equal(await verify(statement), true);
  assert.notEqual(other.publicSignals[other.signalNames.indexOf("executionId")], statement.publicSignals[statement.signalNames.indexOf("executionId")]);
  const report = await reviewPair(other, statement);
  assert.deepEqual(flags(report), {
    proofsValid: true,
    publicMatch: false,
    bindingsValid: true,
    externallyComplete: false,
    verified: false,
  });
});

test("statement proof and public-input failures stay unsuccessful", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const badProof = await reviewPair(guest, flipProof(statement));
  assert.equal(badProof.statement, false);
  assert.equal(badProof.guest, true);
  assert.equal(badProof.proofsValid, false);
  assert.equal(badProof.verified, false);

  const changed = structuredClone(statement);
  const index = changed.signalNames.indexOf("executionId");
  changed.publicSignals[index] = changed.publicSignals[index] === "1" ? "2" : "1";
  assert.equal(await verify(changed), false);
  const changedReport = await reviewPair(guest, changed);
  assert.equal(changedReport.statement, false);
  assert.equal(changedReport.publicMatch, false);
  assert.equal(changedReport.verified, false);

  const short = structuredClone(statement);
  short.publicSignals = statement.publicSignals.slice(0, 29);
  assert.equal(await verify(short), false);
  const reordered = structuredClone(statement);
  reordered.signalNames = [...statement.signalNames].reverse();
  assert.equal(await verify(reordered), false);
});

test("programVersion other than 1 is rejected by the API and by the circuit", { timeout: 180000 }, async () => {
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, programVersion: "2" }), InputError);
  await assert.rejects(
    () => prove(SAMPLE_PARTS, { publicOverrides: { programVersion: "2" } }),
    /Assert Failed|constraint|Error/,
  );
  const { guest, statement } = await pair;
  const wrong = structuredClone(statement);
  wrong.publicSignals[wrong.signalNames.indexOf("programVersion")] = "2";
  assert.equal(await verify(wrong), false);
  const report = await reviewPair(guest, wrong);
  assert.equal(report.bindings.programVersionIsOne, false);
  assert.equal(report.bindingsValid, false);
  assert.equal(report.proofsValid, false);
  assert.equal(report.verified, false);
});

test("a zkvm commitment mismatch is a binding failure and not a ZKVM verification", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const wrong = structuredClone(statement);
  wrong.publicSignals[wrong.signalNames.indexOf("zkvmProofCommitment")] = "1";
  const bindings = await statementBindings(wrong);
  assert.equal(bindings.zkvmTupleBound, false);
  assert.equal(await verify(wrong), false);
  const report = await reviewPair(guest, wrong);
  assert.equal(report.bindingsValid, false);
  assert.equal(report.proofsValid, false);
  assert.equal(report.limits.zkvmTupleIsNotAZkvmVerifier, true);
  assert.equal(report.external.zkvm.verified, false);
  assert.equal(report.verified, false);
});

test("reviewPair keeps each decision separate", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const both = await reviewPair(guest, statement);
  assert.equal(both.proofsValid, true);
  assert.equal(both.publicMatch, true);
  assert.equal(both.verified, false);

  const guestOnly = await reviewPair(guest, flipProof(statement));
  assert.deepEqual(flags(guestOnly), {
    proofsValid: false,
    publicMatch: true,
    bindingsValid: true,
    externallyComplete: false,
    verified: false,
  });
  assert.equal(guestOnly.guest, true);
  assert.equal(guestOnly.statement, false);

  const statementOnly = await reviewPair(flipProof(guest), statement);
  assert.equal(statementOnly.guest, false);
  assert.equal(statementOnly.statement, true);
  assert.equal(statementOnly.proofsValid, false);
  assert.equal(statementOnly.publicMatch, true);
  assert.equal(statementOnly.verified, false);

  const matchedButInvalid = await reviewPair(flipProof(guest), statement);
  assert.equal(matchedButInvalid.publicMatch, true);
  assert.equal(matchedButInvalid.proofsValid, false);
  assert.equal(matchedButInvalid.verified, false);
});

test("external outcomes do not complete a review", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const unset = await reviewPair(guest, statement);
  assert.equal(unset.external.wallClock.outcome, "not-configured");
  assert.equal(unset.externallyComplete, false);
  assert.equal(unset.verified, false);

  const rejected = await reviewPair(guest, statement, {
    allowTestVerifiers: true,
    verifiers: {
      wallClock() {
        return { verified: false, status: "rejected", outcome: "rejected", reason: "expired" };
      },
    },
  });
  assert.equal(rejected.proofsValid, true);
  assert.equal(rejected.external.wallClock.outcome, "rejected");
  assert.equal(rejected.externallyComplete, false);
  assert.equal(rejected.verified, false);

  const errored = await reviewPair(guest, statement, {
    allowTestVerifiers: true,
    verifiers: {
      revocation() {
        throw new Error("revocation failed");
      },
    },
  });
  assert.equal(errored.external.revocation.outcome, "error");
  assert.equal(errored.externallyComplete, false);
  assert.equal(errored.verified, false);

  const missing = await reviewPair(guest, statement, {
    allowTestVerifiers: true,
    verifiers: {
      state() {
        return null;
      },
    },
  });
  assert.equal(missing.external.state.outcome, "missing");
  assert.equal(missing.externallyComplete, false);
  assert.equal(missing.verified, false);
});

test("a development test verifier cannot turn a mock success into verified", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  let calls = 0;
  const report = await reviewPair(guest, statement, {
    allowTestVerifiers: true,
    verifiers: {
      wallClock() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
      revocation() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
      state() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
      authorization() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
      zkvm() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
      attestation() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
    },
  });
  assert.equal(calls, 6);
  assert.equal(report.proofsValid, true);
  assert.equal(report.publicMatch, true);
  assert.equal(report.bindingsValid, true);
  assert.equal(report.external.wallClock.reason, "mock-is-not-verification");
  assert.equal(report.external.wallClock.verified, false);
  assert.equal(report.external.mock, true);
  assert.equal(report.externallyComplete, false);
  assert.equal(report.verified, false);
});

test("production mode rejects development proofs and test verifiers", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  let calls = 0;
  const report = await reviewPair(guest, statement, {
    mode: "production",
    allowTestVerifiers: true,
    verifiers: {
      zkvm() {
        calls += 1;
        return { verified: true, status: "verified", outcome: "verified" };
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal(report.guest, false);
  assert.equal(report.statement, false);
  assert.equal(report.proofsValid, false);
  assert.equal(report.publicMatch, true);
  assert.equal(report.external.zkvm.reason, "test-verifier-forbidden");
  assert.equal(report.external.zkvm.outcome, "error");
  assert.equal(report.externallyComplete, false);
  assert.equal(report.verified, false);
});
