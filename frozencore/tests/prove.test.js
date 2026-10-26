// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";
import { prove } from "../src/prove.js";
import { verify } from "../src/verify.js";
import { SAMPLE_PARTS } from "../src/sample.js";
import { InputError } from "../src/errors.js";

const validProof = prove(SAMPLE_PARTS);

test("a valid witness proves and verifies", { timeout: 180000 }, async () => {
  const envelope = await validProof;
  assert.equal(envelope.production, false);
  assert.equal(envelope.publicSignals.length, 30);
  assert.equal(envelope.signalNames[0], "commitment");
  assert.equal(envelope.signalNames[29], "domainSeparator");
  assert.equal(await verify(envelope), true);
  assert.equal(await verify(envelope), true);
});

test("tamper, reordered signals, and a bad schema fail verification", { timeout: 180000 }, async () => {
  const envelope = await validProof;
  const tampered = structuredClone(envelope);
  tampered.proof.pi_a[0] = tampered.proof.pi_a[0].replace(/[0-9]/, (digit) => (digit === "1" ? "2" : "1"));
  let tamperedOk = false;
  try {
    tamperedOk = await verify(tampered);
  } catch {
    tamperedOk = false;
  }
  assert.equal(tamperedOk, false);

  const swapped = structuredClone(envelope);
  [swapped.publicSignals[0], swapped.publicSignals[1]] = [swapped.publicSignals[1], swapped.publicSignals[0]];
  assert.equal(await verify(swapped), false);

  const renamed = structuredClone(envelope);
  renamed.signalNames = [...envelope.signalNames].reverse();
  assert.equal(await verify(renamed), false);

  const short = structuredClone(envelope);
  short.publicSignals = envelope.publicSignals.slice(0, 29);
  assert.equal(await verify(short), false);

  const claimed = structuredClone(envelope);
  claimed.production = true;
  assert.equal(await verify(claimed), false);
  assert.equal(await verify(null), false);
});

test("an inconsistent nullifier is rejected by the circuit", { timeout: 180000 }, async () => {
  await assert.rejects(
    () => prove(SAMPLE_PARTS, { publicOverrides: { nullifier: "1" } }),
    /Assert Failed|constraint|Error/,
  );
});

test("a non-canonical override is rejected by the API", async () => {
  await assert.rejects(() => prove(SAMPLE_PARTS, { publicOverrides: { epoch: "03" } }), InputError);
});

test("programVersion other than 1 is rejected by the circuit", { timeout: 180000 }, async () => {
  await assert.rejects(
    () => prove(SAMPLE_PARTS, { publicOverrides: { programVersion: "2" } }),
    /Assert Failed|constraint|Error/,
  );
});

test("production mode does not fall back to the development statement key", async () => {
  const { ProofError } = await import("../src/errors.js");
  await assert.rejects(() => prove(SAMPLE_PARTS, { mode: "production" }), ProofError);
});
