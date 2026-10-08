// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { MANIFEST_REL } from "../../src/constants.js";
import { IntegrityError } from "../../src/errors.js";
import { checkIntegrity } from "../../src/integrity/check.js";
import { withTempInstall } from "../helpers.js";

test("a tampered manifest fails the integrity check", async () => {
  await withTempInstall(async (dir) => {
    const manifestPath = path.join(dir, MANIFEST_REL);
    const text = fs.readFileSync(manifestPath, "utf8");
    const index = text.indexOf("a");
    assert.notEqual(index, -1);
    const chars = [...text];
    chars[index] = "b";
    fs.writeFileSync(manifestPath, chars.join(""));
    await assert.rejects(
      () => checkIntegrity(dir),
      (err) => {
        assert.equal(err instanceof IntegrityError, true);
        assert.match(err.message, /manifest\.sha256/);
        return true;
      },
    );
  });
});
