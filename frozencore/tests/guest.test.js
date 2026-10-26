// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import * as snarkjs from "snarkjs";
import { ARTIFACTS, GUEST_PUBLIC_SIGNALS, PROJECT_ROOT } from "../src/constants.js";
import { guestFromParts } from "../src/guest.js";
import { proveGuest } from "../src/guest-prove.js";
import { verifyGuest } from "../src/guest-verify.js";
import { guestProgramId, runGuest } from "../src/statement.js";
import { DEFAULT_GUEST_PROGRAM } from "../src/constants.js";
import { InputError } from "../src/errors.js";

const sample = { inputSecret: "8", inputSalt: "2", executionId: "42" };
const guestProof = proveGuest(sample);

test("the fixed program yields input plus one", async () => {
  assert.equal(runGuest(DEFAULT_GUEST_PROGRAM, 8n), 9n);
  const built = await guestFromParts(sample);
  assert.equal(built.expectedOutput, 9n);
  assert.equal(built.values.outputCommitment, (await guestFromParts({ ...sample, outputSecret: "9" })).values.outputCommitment);
  const programId = await guestProgramId(DEFAULT_GUEST_PROGRAM);
  const other = await guestProgramId([[1n, 0n], [2n, 0n], [3n, 0n], [3n, 0n]]);
  assert.equal(built.values.zkvmProgramId, programId);
  assert.notEqual(programId, other);
  assert.equal(built.publicSignals.length, 4);
  assert.deepEqual(GUEST_PUBLIC_SIGNALS, ["zkvmProgramId", "inputRoot", "outputCommitment", "executionId"]);
});

test("opcode fields are rejected before a proof is built", async () => {
  await assert.rejects(() => guestFromParts({ ...sample, op0: "2" }), InputError);
});

test("a valid guest witness proves and verifies with the guest key", { timeout: 180000 }, async () => {
  const envelope = await guestProof;
  assert.equal(envelope.production, false);
  assert.equal(envelope.schema, "frozencore-guest-journal-v1");
  assert.deepEqual(envelope.signalNames, [...GUEST_PUBLIC_SIGNALS]);
  const built = await guestFromParts(sample);
  assert.deepEqual(envelope.publicSignals, built.publicSignals);
  assert.equal(await verifyGuest(envelope), true);
  assert.equal(await verifyGuest(envelope), true);

  const guestVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.vk"]), "utf8"));
  const statementVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["statement.vk"]), "utf8"));
  assert.equal(guestVk.nPublic, 4);
  assert.equal(statementVk.nPublic, 30);
  assert.notEqual(JSON.stringify(guestVk.IC), JSON.stringify(statementVk.IC));
  let reused = false;
  try {
    reused = await snarkjs.groth16.verify(statementVk, envelope.publicSignals, envelope.proof);
  } catch {
    reused = false;
  }
  assert.equal(reused, false);
});

test("a wrong execution result does not produce a valid guest proof", { timeout: 180000 }, async () => {
  await assert.rejects(
    () => proveGuest({ ...sample, outputSecret: "8" }),
    /Assert Failed|constraint|Error/,
  );
});

test("a substituted program id does not produce a valid guest proof", { timeout: 180000 }, async () => {
  const other = await guestProgramId([[1n, 0n], [2n, 0n], [3n, 0n], [3n, 0n]]);
  await assert.rejects(
    () => proveGuest(sample, { publicOverrides: { zkvmProgramId: other.toString() } }),
    /Assert Failed|constraint|Error/,
  );
});

test("a tampered guest proof fails guest verification", { timeout: 180000 }, async () => {
  const envelope = await guestProof;
  const tampered = structuredClone(envelope);
  tampered.proof.pi_a[0] = tampered.proof.pi_a[0].replace(/[0-9]/, (digit) => (digit === "1" ? "2" : "1"));
  let ok = false;
  try {
    ok = await verifyGuest(tampered);
  } catch {
    ok = false;
  }
  assert.equal(ok, false);
  const swapped = structuredClone(envelope);
  [swapped.publicSignals[0], swapped.publicSignals[1]] = [swapped.publicSignals[1], swapped.publicSignals[0]];
  assert.equal(await verifyGuest(swapped), false);
  const nonCanonical = structuredClone(envelope);
  nonCanonical.publicSignals[3] = "042";
  assert.equal(await verifyGuest(nonCanonical), false);
  const short = structuredClone(envelope);
  short.publicSignals = envelope.publicSignals.slice(0, 3);
  short.signalNames = envelope.signalNames.slice(0, 3);
  assert.equal(await verifyGuest(short), false);
  assert.equal(await verifyGuest({ ...envelope, proof: undefined }), false);
});

test("forged public values and out-of-range inputs do not prove", { timeout: 180000 }, async () => {
  const built = await guestFromParts(sample);
  await assert.rejects(
    () => proveGuest(sample, { publicOverrides: { inputRoot: "1" } }),
    /Assert Failed|constraint|Error/,
  );
  await assert.rejects(
    () => proveGuest(sample, { publicOverrides: { outputCommitment: "1" } }),
    /Assert Failed|constraint|Error/,
  );
  await assert.rejects(
    () => proveGuest(sample, { publicOverrides: { executionId: "43" } }),
    /Assert Failed|constraint|Error/,
  );
  await assert.rejects(
    () => guestFromParts({ ...sample, inputSecret: (1n << 64n).toString() }),
    InputError,
  );
  await assert.rejects(
    () => guestFromParts({ ...sample, executionId: (1n << 128n).toString() }),
    InputError,
  );
  await assert.rejects(() => guestFromParts({ ...sample, secret: "1" }), InputError);
  assert.equal(built.publicSignals[3], "42");
  const { ProofError } = await import("../src/errors.js");
  await assert.rejects(() => proveGuest(sample, { mode: "production" }), ProofError);
  assert.equal(await verifyGuest(await guestProof, { mode: "production" }), false);
});
