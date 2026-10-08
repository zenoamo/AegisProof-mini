// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BN254_SCALAR_FIELD } from "../../src/constants.js";
import { InputError, ProofError } from "../../src/errors.js";
import { prove } from "../../src/prover/prove.js";

describe("invalid inputs", { concurrency: false }, () => {
  test("mismatched commitment fails proof generation", { timeout: 180000 }, async () => {
    const secret = "13579135791357913579";
    await assert.rejects(
      () => prove({ secret, commitment: "2" }),
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
      () => prove({ secret: "01", commitment: "1" }),
      (err) => err instanceof InputError,
    );
  });

  test("a witness outside the scalar field is rejected before proving", async () => {
    await assert.rejects(
      () => prove({ secret: BN254_SCALAR_FIELD.toString(), commitment: "1" }),
      (err) => err instanceof InputError,
    );
  });

  test("a numeric JSON witness is rejected before proving", async () => {
    await assert.rejects(
      () => prove({ secret: 7, commitment: "1" }),
      (err) => err instanceof InputError,
    );
  });
});
