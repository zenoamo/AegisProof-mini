// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkArtifactBinding } from "../../src/integrity/keys.js";

test("current zkey exports the verification key in the manifest", { timeout: 180000 }, async () => {
  const report = await checkArtifactBinding();
  assert.equal(report.protocol, "groth16");
  assert.equal(report.curve, "bn254");
  assert.equal(report.snarkjsCurve, "bn128");
  assert.equal(report.nPublic, 1);
  assert.equal(report.constraints, 415);
  assert.equal(report.privateInputs, 1);
  assert.equal(report.publicInputs, 1);
  assert.equal(typeof report.artifacts["circuit.zkey"], "string");
  assert.equal(report.ceremony.production, false);
  assert.equal(report.ceremony.contributors, 1);
});
