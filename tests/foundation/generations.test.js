// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ARTIFACTS, PROJECT_ROOT } from "../../src/constants.js";
import { MINI_010_LOCAL_ACCEPTANCE, identifyStatement, verifyStatement } from "../../src/foundation.js";
import { verifyGroth16 } from "../../src/verifier/verify.js";

const retired = {
  version: "aegisproof-mini-0.1.0",
  schema: "aegisproof-mini-public-signals-v1",
  protocol: "groth16",
  curve: "bn254",
  publicSignals: ["1"],
  proof: { protocol: "groth16", curve: "bn128", pi_a: ["1", "2", "1"], pi_b: [["1", "2"], ["3", "4"], ["1", "0"]], pi_c: ["1", "2", "1"] },
};

test("0.1.0 is the canonical verifier and a fake proof still fails", async () => {
  assert.equal(MINI_010_LOCAL_ACCEPTANCE, "canonical");
  const found = identifyStatement(retired);
  assert.equal(found.id, "mini-0.1.0");
  assert.equal(found.verifiable, true);
  assert.equal(await verifyStatement(retired), false);
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, "experimental", "mini-0.2.0", "circuit", "mini.zkey")), true);
});

test("the 0.2.0 verification key is not applied to a 1-signal proof", async () => {
  const canonical = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["verification_key.json"]), "utf8"));
  assert.equal(canonical.nPublic, 1);
  const vk = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, "experimental", "mini-0.2.0", "keys", "verification_key.json"), "utf8"),
  );
  assert.equal(vk.nPublic, 5);
  assert.equal(await verifyGroth16(vk, retired.publicSignals, retired.proof), false);
  const relabeled = { ...retired, schema: "aegisproof-mini-public-signals-v2", version: "aegisproof-mini-0.2.0", publicSignals: ["1", "2", "3", "4", "5"] };
  assert.equal(identifyStatement(relabeled).id, "mini-0.2.0");
  assert.equal(identifyStatement(relabeled).verifiable, false);
  assert.equal(await verifyStatement(relabeled), false);
});
