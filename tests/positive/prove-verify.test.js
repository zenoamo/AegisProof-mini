// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { PROJECT_ROOT } from "../../src/constants.js";
import { checkIntegrity } from "../../src/integrity/check.js";
import { verify } from "../../src/verifier/verify.js";
import { assertNoSecretKey, validEnvelope } from "../helpers.js";

describe("positive proofs", { concurrency: false }, () => {
  test("integrity of the built artifacts holds", async () => {
    const result = await checkIntegrity();
    assert.equal(result.manifest.ceremony.production, false);
    assert.equal(result.manifest.circuit.publicSignals.length, 1);
    assert.equal(result.manifest.circuit.publicSignals[0], "commitment");
    assert.equal(Object.keys(result.artifacts).length, 4);
  });

  test("valid input produces a proof and verification succeeds", { timeout: 180000 }, async () => {
    const { input, envelope } = await validEnvelope();
    assert.equal(envelope.schema, "aegisproof-mini-public-signals-v1");
    assert.equal(envelope.curve, "bn254");
    assert.equal(envelope.proof.curve, "bn128");
    assert.deepEqual(envelope.publicSignals, [input.commitment]);
    assert.notEqual(envelope.publicSignals[0], input.secret);
    assertNoSecretKey(envelope);
    assert.equal(await verify(envelope), true);
  });

  test("valid fixture describes the public schema only", () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "fixtures", "valid", "statement.json"), "utf8"),
    );
    assert.deepEqual(fixture.publicSignals, ["commitment"]);
    assert.equal(Object.hasOwn(fixture, "secret"), false);
  });
});
