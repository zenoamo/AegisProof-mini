// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PUBLIC_SIGNALS, SCHEMA, VERSION } from "../../src/constants.js";
import { InputError, ProofError } from "../../src/errors.js";
import { readEnvelope, verify, verifyGroth16 } from "../../src/verifier/verify.js";
import { prove } from "../../src/prover/prove.js";
import {
  contextFieldFromBytes,
  contextFieldFromUtf8,
  nullifierFromParts,
  statementFromParts,
} from "../../src/statement.js";
import { TEST_CONTEXT, TEST_EPOCH, TEST_POLICY_ID, validEnvelope, validInput } from "../helpers.js";

const structuralProof = {
  protocol: "groth16",
  curve: "bn128",
  pi_a: ["0", "0", "1"],
  pi_b: [["0", "0"], ["0", "0"], ["1", "0"]],
  pi_c: ["0", "0", "1"],
};

function withSignals(envelope, publicSignals) {
  return { ...structuredClone(envelope), publicSignals };
}

describe("five public signals", { concurrency: false }, () => {
  test("bytes become one canonical field element", () => {
    assert.equal(contextFieldFromUtf8("A"), 65n);
    assert.equal(contextFieldFromBytes(Uint8Array.of(0)), 0n);
    assert.throws(() => contextFieldFromBytes(Uint8Array.of(0, 1)), InputError);
    assert.throws(() => contextFieldFromBytes(new Uint8Array(32)), InputError);
    assert.throws(() => contextFieldFromBytes(new Uint8Array()), InputError);
    const encoded = contextFieldFromUtf8("あ");
    assert.equal(contextFieldFromBytes(new TextEncoder().encode("あ")), encoded);
  });

  test("the same secret gets a new nullifier when the scope changes", async () => {
    const first = await validInput();
    const otherContext = await statementFromParts({
      secret: BigInt(first.secret),
      context: 12n,
      policyId: BigInt(TEST_POLICY_ID),
      epoch: BigInt(TEST_EPOCH),
    });
    const otherEpoch = await statementFromParts({
      secret: BigInt(first.secret),
      context: BigInt(TEST_CONTEXT),
      policyId: BigInt(TEST_POLICY_ID),
      epoch: 4n,
    });
    assert.equal(first.commitment, otherContext.commitment);
    assert.notEqual(first.nullifier, otherContext.nullifier);
    assert.notEqual(first.nullifier, otherEpoch.nullifier);
    const seen = new Set();
    assert.equal(seen.has(first.nullifier), false);
    seen.add(first.nullifier);
    assert.equal(seen.has(first.nullifier), true);
  });

  test("a valid statement proves and verifies in order", { timeout: 180000 }, async () => {
    const { input, envelope } = await validEnvelope();
    assert.deepEqual(Object.keys({
      commitment: 0,
      nullifier: 1,
      contextHash: 2,
      policyId: 3,
      epoch: 4,
    }), [...PUBLIC_SIGNALS]);
    assert.equal(envelope.version, VERSION);
    assert.equal(envelope.schema, SCHEMA);
    assert.equal(envelope.publicSignals.length, 5);
    assert.deepEqual(envelope.publicSignals, input.publicSignals);
    assert.equal(envelope.publicSignals[0], input.commitment);
    assert.equal(envelope.publicSignals[1], input.nullifier);
    assert.equal(envelope.publicSignals[2], input.contextHash);
    assert.equal(envelope.publicSignals[3], input.policyId);
    assert.equal(envelope.publicSignals[4], input.epoch);
    assert.equal(await verify(envelope), true);
    const fromBytes = contextFieldFromUtf8("A");
    const utf8Statement = await statementFromParts({
      secret: 5n,
      context: fromBytes,
      policyId: 7n,
      epoch: 3n,
    });
    const utf8Proof = await prove({
      secret: utf8Statement.secret,
      context: utf8Statement.context,
      policyId: utf8Statement.policyId,
      epoch: utf8Statement.epoch,
    });
    assert.equal(utf8Proof.publicSignals[2], utf8Statement.contextHash);
    assert.equal(await verify(utf8Proof), true);
  });

  test("public signal counts other than 5 are rejected", async () => {
    const { envelope } = await validEnvelope();
    for (const count of [1, 4, 6]) {
      const signals = Array.from({ length: count }, () => "1");
      assert.equal(readEnvelope(withSignals(envelope, signals)), null);
      assert.equal(await verify(withSignals(envelope, signals)), false);
      assert.equal(await verifyGroth16({ nPublic: 5, protocol: "groth16", curve: "bn128" }, signals, envelope.proof), false);
    }
  });

  test("a swapped public signal order does not verify", { timeout: 180000 }, async () => {
    const { envelope } = await validEnvelope();
    const swapped = [...envelope.publicSignals];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    assert.notEqual(swapped[0], envelope.publicSignals[0]);
    assert.equal(await verify(withSignals(envelope, swapped)), false);
  });

  test("a non-canonical public signal is rejected", async () => {
    const { envelope } = await validEnvelope();
    const signals = [...envelope.publicSignals];
    signals[3] = "01";
    assert.equal(readEnvelope(withSignals(envelope, signals)), null);
    assert.equal(await verify(withSignals(envelope, signals)), false);
  });

  test("wrong nullifier, contextHash, policy, and epoch fail", { timeout: 180000 }, async () => {
    const input = await validInput("13579135791357913579");
    const request = {
      secret: input.secret,
      context: input.context,
      policyId: input.policyId,
      epoch: input.epoch,
    };
    await assert.rejects(
      () => prove({ ...request, nullifier: "1" }),
      (err) => err instanceof ProofError && err.code === "CONSTRAINT" && !err.message.includes(input.secret),
    );
    await assert.rejects(
      () => prove({ ...request, contextHash: "1" }),
      (err) => err instanceof ProofError && err.code === "CONSTRAINT",
    );
    const otherPolicy = await nullifierFromParts({
      secret: BigInt(input.secret),
      contextHash: BigInt(input.contextHash),
      policyId: 8n,
      epoch: BigInt(input.epoch),
    });
    await assert.rejects(
      () => prove({ ...request, nullifier: otherPolicy }),
      (err) => err instanceof ProofError && err.code === "CONSTRAINT",
    );
    const otherEpoch = await nullifierFromParts({
      secret: BigInt(input.secret),
      contextHash: BigInt(input.contextHash),
      policyId: BigInt(input.policyId),
      epoch: 4n,
    });
    await assert.rejects(
      () => prove({ ...request, nullifier: otherEpoch }),
      (err) => err instanceof ProofError && err.code === "CONSTRAINT",
    );

    const { envelope } = await validEnvelope();
    const policyTamper = [...envelope.publicSignals];
    policyTamper[3] = policyTamper[3] === "1" ? "2" : "1";
    assert.equal(await verify(withSignals(envelope, policyTamper)), false);
    const epochTamper = [...envelope.publicSignals];
    epochTamper[4] = epochTamper[4] === "1" ? "2" : "1";
    assert.equal(await verify(withSignals(envelope, epochTamper)), false);
    const proofTamper = structuredClone(envelope);
    proofTamper.proof.pi_a[0] = proofTamper.proof.pi_a[0] === "1" ? "2" : "1";
    assert.equal(await verify(proofTamper), false);
  });
});
