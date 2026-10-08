// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { ARTIFACTS, PROJECT_ROOT } from "../../src/constants.js";
import { readEnvelope, verify, verifyGroth16 } from "../../src/verifier/verify.js";

const structuralProof = {
  protocol: "groth16",
  curve: "bn128",
  pi_a: ["0", "0", "1"],
  pi_b: [
    ["0", "0"],
    ["0", "0"],
    ["1", "0"],
  ],
  pi_c: ["0", "0", "1"],
};

describe("schema isolation", () => {
  test("a 30-field publicSignals vector is rejected", async () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "fixtures", "invalid", "v2-public-signals.json"), "utf8"),
    );
    assert.equal(fixture.publicSignals.length, 30);
    const vkey = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["verification_key.json"]), "utf8"),
    );
    assert.equal(await verifyGroth16(vkey, fixture.publicSignals, structuralProof), false);
    const envelope = {
      version: "aegisproof-mini-0.1.0",
      schema: "aegisproof-mini-public-signals-v1",
      protocol: "groth16",
      curve: "bn254",
      publicSignals: fixture.publicSignals,
      proof: structuralProof,
    };
    assert.equal(readEnvelope(envelope), null);
    assert.equal(await verify(envelope), false);
  });

  test("an empty publicSignals vector is rejected", async () => {
    const vkey = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["verification_key.json"]), "utf8"),
    );
    assert.equal(await verifyGroth16(vkey, [], structuralProof), false);
  });
});
