// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { ARTIFACTS } from "../../src/constants.js";
import { digestArtifacts, generateKeyPair, signDigest, verifyDigest } from "../../src/authenticity/mldsa.js";
import { checkIntegrity } from "../../src/integrity/check.js";
import { sha256File } from "../../src/integrity/hash.js";
import { writeManifest } from "../../src/integrity/manifest.js";
import { flipFirstByte, withTempInstall } from "../helpers.js";

describe("ML-DSA-87 artifact authenticity", () => {
  test("a signature over the manifest digest verifies, and tampering does not", async () => {
    const integrity = await checkIntegrity();
    const { secretKey, publicKey } = generateKeyPair();
    const digest = digestArtifacts(integrity.manifest.artifacts);
    const signature = signDigest(secretKey, digest);
    assert.equal(verifyDigest(publicKey, signature, digest), true);

    const flipped = new Uint8Array(signature);
    flipped[0] ^= 0xff;
    assert.equal(verifyDigest(publicKey, flipped, digest), false);

    const other = generateKeyPair();
    assert.equal(verifyDigest(other.publicKey, signature, digest), false);

    const badDigest = new Uint8Array(digest);
    badDigest[0] ^= 0xff;
    assert.equal(verifyDigest(publicKey, signature, badDigest), false);
  });

  test("rewriting hashes to hide a wasm change still fails ML-DSA", async () => {
    await withTempInstall(async (dir) => {
      const before = await checkIntegrity(dir);
      const { secretKey, publicKey } = generateKeyPair();
      const digest = digestArtifacts(before.manifest.artifacts);
      const signature = signDigest(secretKey, digest);

      flipFirstByte(path.join(dir, ARTIFACTS["circuit.wasm"]));
      const artifacts = {};
      for (const [name, rel] of Object.entries(ARTIFACTS)) {
        artifacts[name] = sha256File(path.join(dir, rel));
      }
      const next = structuredClone(before.manifest);
      next.artifacts = artifacts;
      if (next.files) {
        for (const [name, rel] of Object.entries(ARTIFACTS)) {
          next.files[name] = {
            ...next.files[name],
            sha256: artifacts[name],
            bytes: fs.statSync(path.join(dir, rel)).size,
          };
        }
      }
      writeManifest(dir, next);

      const after = await checkIntegrity(dir);
      const rewritten = digestArtifacts(after.manifest.artifacts);
      assert.notEqual(Buffer.from(rewritten).toString("hex"), Buffer.from(digest).toString("hex"));
      assert.equal(verifyDigest(publicKey, signature, rewritten), false);
      assert.equal(signDigest(secretKey, digest).length, signature.length);
    });
  });
});
