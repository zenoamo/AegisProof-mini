// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, GUEST_PUBLIC_SIGNALS, PROJECT_ROOT, PUBLIC_SIGNALS } from "../src/constants.js";
import { prove } from "../src/prove.js";
import { verify } from "../src/verify.js";
import { proveGuest } from "../src/guest-prove.js";
import { verifyGuest } from "../src/guest-verify.js";
import { guestPublicMatch, reviewPair } from "../src/review.js";
import { productionReadiness } from "../src/keys.js";
import { SAMPLE_PARTS } from "../src/sample.js";

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

test("both proofs verify and the four public values match, without external completion", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  assert.equal(await verifyGuest(guest), true);
  assert.equal(await verify(statement), true);
  assert.equal(guestPublicMatch(guest, statement), true);
  const report = await reviewPair(guest, statement);
  assert.equal(report.guest, true);
  assert.equal(report.statement, true);
  assert.equal(report.publicMatch, true);
  assert.equal(report.bindings.programVersionIsOne, true);
  assert.equal(report.bindings.zkvmTupleBound, true);
  assert.equal(report.proofsValid, true);
  assert.equal(report.bindingsValid, true);
  assert.equal(report.externallyComplete, false);
  assert.equal(report.external.externallyComplete, false);
  assert.equal(report.external.wallClock.status, "not-configured");
  assert.equal(report.limits.publicMatchIsNotAProof, true);
  assert.equal(report.limits.zkvmTupleIsNotAZkvmVerifier, true);
  assert.equal(report.verified, false);
  const readiness = productionReadiness();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.fallbackToDevelopmentKeys, false);
  assert.equal(readiness.productionKeysPresent, false);
});

test("a missing, tampered, or swapped guest proof does not succeed", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const missing = await reviewPair(null, statement);
  assert.equal(missing.guest, false);
  assert.equal(missing.verified, false);
  const tampered = await reviewPair(flipProof(guest), statement);
  assert.equal(tampered.guest, false);
  assert.equal(tampered.publicMatch, true);
  assert.equal(tampered.verified, false);
  const swapped = structuredClone(guest);
  swapped.proof = statement.proof;
  const replaced = await reviewPair(swapped, statement);
  assert.equal(replaced.guest, false);
  assert.equal(replaced.verified, false);
});

test("a missing, tampered, or swapped statement proof does not succeed", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const missing = await reviewPair(guest, null);
  assert.equal(missing.statement, false);
  assert.equal(missing.verified, false);
  const tampered = await reviewPair(guest, flipProof(statement));
  assert.equal(tampered.statement, false);
  assert.equal(tampered.guest, true);
  assert.equal(tampered.verified, false);
  const swapped = structuredClone(statement);
  swapped.proof = guest.proof;
  const replaced = await reviewPair(guest, swapped);
  assert.equal(replaced.statement, false);
  assert.equal(replaced.verified, false);
});

test("changing any shared public value fails verification or the match", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  for (const name of GUEST_PUBLIC_SIGNALS) {
    const guestChanged = structuredClone(guest);
    const guestIndex = guest.signalNames.indexOf(name);
    guestChanged.publicSignals[guestIndex] = guestChanged.publicSignals[guestIndex] === "1" ? "2" : "1";
    const guestReport = await reviewPair(guestChanged, statement);
    assert.equal(guestReport.verified, false);
    assert.equal(guestReport.guest === true && guestReport.publicMatch === true, false);

    const statementChanged = structuredClone(statement);
    const statementIndex = statement.signalNames.indexOf(name);
    statementChanged.publicSignals[statementIndex] = statementChanged.publicSignals[statementIndex] === "1" ? "2" : "1";
    const statementReport = await reviewPair(guest, statementChanged);
    assert.equal(statementReport.verified, false);
    assert.equal(statementReport.statement === true && statementReport.publicMatch === true, false);
  }
});

test("the guest and statement keys are not interchangeable", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  assert.equal(await verify(guest), false);
  assert.equal(await verifyGuest(statement), false);
  const statementVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["statement.vk"]), "utf8"));
  const guestVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.vk"]), "utf8"));
  const legacyVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/keys/statement_verification_key.json"), "utf8"));
  assert.notEqual(statementVk.nPublic, guestVk.nPublic);
  let cross = false;
  try {
    cross = await snarkjs.groth16.verify(statementVk, guest.publicSignals, guest.proof);
  } catch {
    cross = false;
  }
  assert.equal(cross, false);
  let legacy = false;
  try {
    legacy = await snarkjs.groth16.verify(legacyVk, statement.publicSignals, statement.proof);
  } catch {
    legacy = false;
  }
  assert.equal(legacy, false);
  assert.equal(PUBLIC_SIGNALS.includes("zkvmProofCommitment"), true);
  assert.equal(GUEST_PUBLIC_SIGNALS.includes("zkvmProofCommitment"), false);
});

test("malformed, throwing, or incomplete reviews are not success", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const nonCanonical = structuredClone(guest);
  nonCanonical.publicSignals = [...guest.publicSignals];
  nonCanonical.publicSignals[3] = "042";
  assert.equal(await verifyGuest(nonCanonical), false);
  const exploded = new Proxy(guest, {
    get(target, property, receiver) {
      if (property === "publicSignals") throw new Error("review boom");
      return Reflect.get(target, property, receiver);
    },
  });
  const thrown = await reviewPair(exploded, statement);
  assert.equal(thrown.guest, false);
  assert.equal(thrown.statement, true);
  assert.equal(thrown.verified, false);
  const incomplete = await reviewPair({ schema: guest.schema }, statement);
  assert.equal(incomplete.guest, false);
  assert.equal(incomplete.publicMatch, false);
  assert.equal(incomplete.verified, false);
});

test("one valid proof does not make the pair valid", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const guestOnly = await reviewPair(guest, flipProof(statement));
  assert.equal(guestOnly.guest, true);
  assert.equal(guestOnly.statement, false);
  assert.equal(guestOnly.proofsValid, false);
  assert.equal(guestOnly.verified, false);
  const statementOnly = await reviewPair(flipProof(guest), statement);
  assert.equal(statementOnly.statement, true);
  assert.equal(statementOnly.guest, false);
  assert.equal(statementOnly.proofsValid, false);
  assert.equal(statementOnly.verified, false);
});

test("valid proofs of different public values do not verify as a pair", { timeout: 180000 }, async () => {
  const { statement } = await pair;
  const other = await proveGuest({ inputSecret: "8", inputSalt: "2", executionId: "7" });
  assert.equal(await verifyGuest(other), true);
  assert.equal(await verify(statement), true);
  const report = await reviewPair(other, statement);
  assert.equal(report.proofsValid, true);
  assert.equal(report.publicMatch, false);
  assert.equal(report.verified, false);
});

test("matching public values with an invalid proof are not proofsValid", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const report = await reviewPair(flipProof(guest), statement);
  assert.equal(report.publicMatch, true);
  assert.equal(report.proofsValid, false);
  assert.equal(report.verified, false);
});

test("programVersion and zkvm tuple failures stay unbound", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const { statementBindings } = await import("../src/review.js");
  const wrongVersion = structuredClone(statement);
  wrongVersion.publicSignals[wrongVersion.signalNames.indexOf("programVersion")] = "2";
  assert.equal((await statementBindings(wrongVersion)).programVersionIsOne, false);
  const versionReport = await reviewPair(guest, wrongVersion);
  assert.equal(versionReport.bindingsValid, false);
  assert.equal(versionReport.proofsValid, false);
  assert.equal(versionReport.verified, false);
  const wrongTuple = structuredClone(statement);
  wrongTuple.publicSignals[wrongTuple.signalNames.indexOf("zkvmProofCommitment")] = "1";
  assert.equal((await statementBindings(wrongTuple)).zkvmTupleBound, false);
  const tupleReport = await reviewPair(guest, wrongTuple);
  assert.equal(tupleReport.bindingsValid, false);
  assert.equal(tupleReport.verified, false);
});

test("production mode does not accept the development proofs", { timeout: 180000 }, async () => {
  const { guest, statement } = await pair;
  const report = await reviewPair(guest, statement, { mode: "production" });
  assert.equal(report.proofsValid, false);
  assert.equal(report.verified, false);
  assert.equal(report.external.mode, "production");
});
