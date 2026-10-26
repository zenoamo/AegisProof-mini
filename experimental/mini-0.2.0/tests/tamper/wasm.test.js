// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { ARTIFACTS } from "../../src/constants.js";
import { IntegrityError } from "../../src/errors.js";
import { checkIntegrity } from "../../src/integrity/check.js";
import { flipFirstByte, withTempInstall } from "../helpers.js";

test("a tampered wasm fails the SHA-256 check and leaves the original install intact", async () => {
  await withTempInstall(async (dir) => {
    flipFirstByte(path.join(dir, ARTIFACTS["circuit.wasm"]));
    await assert.rejects(
      () => checkIntegrity(dir),
      (err) => {
        assert.equal(err instanceof IntegrityError, true);
        assert.equal(err.message.includes("circuit.wasm"), true);
        return true;
      },
    );
  });
  const clean = await checkIntegrity();
  assert.equal(typeof clean.artifacts["circuit.wasm"], "string");
});
