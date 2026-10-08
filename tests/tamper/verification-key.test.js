// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ARTIFACTS, PROJECT_ROOT } from "../../src/constants.js";
import { verifyGroth16 } from "../../src/verifier/verify.js";
import { validEnvelope } from "../helpers.js";

test("a tampered verification key fails cryptographic verification", { timeout: 180000 }, async () => {
  const { envelope } = await validEnvelope();
  const vkey = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["verification_key.json"]), "utf8"));
  const tampered = structuredClone(vkey);
  tampered.vk_alpha_1[0] = tampered.vk_alpha_1[0] === "1" ? "2" : "1";
  assert.equal(await verifyGroth16(tampered, envelope.publicSignals, envelope.proof), false);
});
