// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { ARTIFACTS } from "../../src/constants.js";
import { IntegrityError } from "../../src/errors.js";
import { checkIntegrity } from "../../src/integrity/check.js";
import { flipFirstByte, withTempInstall } from "../helpers.js";

test("a tampered zkey fails the SHA-256 check", async () => {
  await withTempInstall(async (dir) => {
    flipFirstByte(path.join(dir, ARTIFACTS["circuit.zkey"]));
    await assert.rejects(
      () => checkIntegrity(dir),
      (err) => {
        assert.equal(err instanceof IntegrityError, true);
        assert.equal(err.message.includes("circuit.zkey"), true);
        return true;
      },
    );
  });
});
