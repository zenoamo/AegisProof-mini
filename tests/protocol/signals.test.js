// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PUBLIC_SIGNALS, PROJECT_ROOT, SCHEMA, VERSION } from "../../src/constants.js";
import { identifyStatement, verifyStatement } from "../../src/foundation.js";
import { verify } from "../../src/verifier/verify.js";

const experimentalRoot = path.join(PROJECT_ROOT, "experimental", "mini-0.2.0");

test("the root protocol stays the 1-signal generation", () => {
  assert.equal(VERSION, "aegisproof-mini-0.1.0");
  assert.equal(SCHEMA, "aegisproof-mini-public-signals-v1");
  assert.deepEqual([...PUBLIC_SIGNALS], ["commitment"]);
});

test("a 5-signal statement is not verified with the root key", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(experimentalRoot, "artifacts", "manifest.json"), "utf8"));
  assert.equal(manifest.version, "aegisproof-mini-0.2.0");
  assert.equal(manifest.binding.nPublic, 5);
  const envelope = {
    version: "aegisproof-mini-0.2.0",
    schema: "aegisproof-mini-public-signals-v2",
    protocol: "groth16",
    curve: "bn254",
    publicSignals: ["1", "2", "3", "4", "5"],
    proof: {
      protocol: "groth16",
      curve: "bn128",
      pi_a: ["1", "2", "1"],
      pi_b: [["1", "2"], ["3", "4"], ["1", "0"]],
      pi_c: ["1", "2", "1"],
    },
  };
  assert.equal(identifyStatement(envelope).verifiable, false);
  assert.equal(await verifyStatement(envelope), false);
  assert.equal(await verify(envelope), false);
});
