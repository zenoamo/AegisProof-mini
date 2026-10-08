// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import { verify } from "../../src/verifier/verify.js";
import { validEnvelope } from "../helpers.js";

test("a tampered public signal fails verification", { timeout: 180000 }, async () => {
  const { envelope } = await validEnvelope();
  const tampered = structuredClone(envelope);
  tampered.publicSignals[0] = envelope.publicSignals[0] === "1" ? "2" : "1";
  assert.equal(await verify(tampered), false);
});
