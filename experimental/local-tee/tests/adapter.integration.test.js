// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { statementFromParts, verify } from "../../mini-0.2.0/src/index.js";
import { TEST_EPOCH, TEST_POLICY_ID, TEST_SECRET, TEST_CONTEXT } from "../../mini-0.2.0/tests/helpers.js";
import { createAdapter } from "../src/adapter.js";
import { hasSecretField, parsePublicResult } from "../src/envelope.js";
import { createLocalBackend } from "../src/local-backend.js";

describe("local tee integration", { concurrency: false }, () => {
  test("connects poseidon, prove, and verify without treating the local process as a tee", { timeout: 180000 }, async () => {
    const adapter = createAdapter(createLocalBackend());
    const result = await adapter.prove({
      secret: TEST_SECRET,
      context: TEST_CONTEXT,
      policyId: TEST_POLICY_ID,
      epoch: TEST_EPOCH,
    });
    const parsed = parsePublicResult(result);
    assert.equal(parsed.backend.kind, "local-process");
    assert.equal(parsed.backend.claims.hardwareIsolation, false);
    assert.equal(parsed.backend.claims.remoteAttestation, false);
    assert.equal(parsed.backend.attestation, null);
    assert.equal(parsed.verified.hardwareIsolation, false);
    assert.equal(parsed.verified.remoteAttestation, false);
    assert.equal(parsed.verified.attestation, null);
    assert.equal(parsed.proofEnvelope.publicSignals.length, 5);
    const statement = await statementFromParts({
      secret: BigInt(TEST_SECRET),
      context: BigInt(TEST_CONTEXT),
      policyId: BigInt(TEST_POLICY_ID),
      epoch: BigInt(TEST_EPOCH),
    });
    assert.deepEqual(parsed.proofEnvelope.publicSignals, statement.publicSignals);
    assert.equal(parsed.proofEnvelope.publicSignals[0], parsed.commitment);
    assert.equal(hasSecretField(parsed), false);
    assert.equal(JSON.stringify(parsed).includes(TEST_SECRET), false);
    assert.equal(await verify(parsed.proofEnvelope), true);

    const tampered = structuredClone(parsed.proofEnvelope);
    tampered.publicSignals = ["1"];
    assert.equal(await verify(tampered), false);
  });
});
