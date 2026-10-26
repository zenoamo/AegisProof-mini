// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BN254_SCALAR_FIELD } from "../../src/constants.js";
import { InputError, ProofError } from "../../src/errors.js";
import { prove } from "../../src/prover/prove.js";

function witness(secret, extra = {}) {
  return { secret, context: "11", policyId: "7", epoch: "3", ...extra };
}

describe("invalid inputs", { concurrency: false }, () => {
  test("mismatched commitment fails proof generation", { timeout: 180000 }, async () => {
    const secret = "13579135791357913579";
    await assert.rejects(
      () => prove(witness(secret, { commitment: "2" })),
      (err) => {
        assert.equal(err instanceof ProofError, true);
        assert.equal(err.code, "CONSTRAINT");
        assert.equal(String(err.message).includes(secret), false);
        assert.equal(String(err.stack).includes(secret), false);
        return true;
      },
    );
  });

  test("a non-decimal witness is rejected before proving", async () => {
    await assert.rejects(
      () => prove(witness("01", { commitment: "1" })),
      (err) => err instanceof InputError,
    );
  });

  test("a witness outside the scalar field is rejected before proving", async () => {
    await assert.rejects(
      () => prove(witness(BN254_SCALAR_FIELD.toString(), { commitment: "1" })),
      (err) => err instanceof InputError,
    );
  });

  test("a numeric JSON witness is rejected before proving", async () => {
    await assert.rejects(
      () => prove(witness(7, { commitment: "1" })),
      (err) => err instanceof InputError,
    );
  });
});
