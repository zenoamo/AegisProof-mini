// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ARTIFACTS, PROJECT_ROOT } from "../../src/constants.js";
import { sha256File } from "../../src/integrity/hash.js";
import { poseidonCommitment } from "../../src/commitment.js";

function run(args) {
  return spawnSync(process.execPath, [path.join(PROJECT_ROOT, "src", "cli", "index.js"), ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
}

test("cli prove, verify, tamper, invalid input, and integrity", { timeout: 180000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "aegisproof-mini-cli-"));
  const secret = "42424242424242424242";
  const inputPath = path.join(dir, "input.json");
  const proofPath = path.join(dir, "proof.json");
  const zkeyBefore = sha256File(path.join(PROJECT_ROOT, ARTIFACTS["circuit.zkey"]));
  try {
    const commitment = await poseidonCommitment(BigInt(secret));
    fs.writeFileSync(inputPath, `${JSON.stringify({ secret, commitment })}\n`);
    const proved = run(["prove", "--input", inputPath, "--output", proofPath]);
    assert.equal(proved.status, 0, proved.stderr);
    assert.equal(`${proved.stdout}${proved.stderr}`.includes(secret), false);
    const proofText = fs.readFileSync(proofPath, "utf8");
    assert.equal(proofText.includes(secret), false);
    assert.equal(proofText.includes('"secret"'), false);

    const verified = run(["verify", "--proof", proofPath]);
    assert.equal(verified.status, 0, verified.stderr);

    const envelope = JSON.parse(proofText);
    envelope.proof.pi_a[0] = envelope.proof.pi_a[0] === "1" ? "2" : "1";
    fs.writeFileSync(proofPath, `${JSON.stringify(envelope)}\n`);
    const rejected = run(["verify", "--proof", proofPath]);
    assert.equal(rejected.status, 1);

    fs.writeFileSync(inputPath, `${JSON.stringify({ secret, commitment: "2" })}\n`);
    const invalid = run(["prove", "--input", inputPath, "--output", proofPath]);
    assert.equal(invalid.status, 3);
    assert.equal(`${invalid.stdout}${invalid.stderr}`.includes(secret), false);

    const overwrite = run([
      "prove",
      "--input", inputPath,
      "--output",
      path.join(PROJECT_ROOT, ARTIFACTS["circuit.zkey"]),
    ]);
    assert.equal(overwrite.status, 4);
    assert.equal(sha256File(path.join(PROJECT_ROOT, ARTIFACTS["circuit.zkey"])), zkeyBefore);

    const integrity = run(["integrity"]);
    assert.equal(integrity.status, 0, integrity.stderr);
    assert.equal(integrity.stdout.includes("integrity: ok"), true);
    assert.equal(integrity.stdout.includes(secret), false);

    const publicKeyPath = path.join(dir, "public.json");
    const signaturePath = path.join(dir, "signature.json");
    const secretKeyPath = path.join(dir, "secret.json");
    const signed = run([
      "sign",
      "--public-key-out",
      publicKeyPath,
      "--signature-out",
      signaturePath,
      "--secret-key-out",
      secretKeyPath,
    ]);
    assert.equal(signed.status, 0, signed.stderr);
    const secretKeyHex = JSON.parse(fs.readFileSync(secretKeyPath, "utf8")).secretKey;
    assert.equal(`${signed.stdout}${signed.stderr}`.includes(secretKeyHex), false);
    const authentic = run(["authenticity", "--public-key", publicKeyPath, "--signature", signaturePath]);
    assert.equal(authentic.status, 0, authentic.stderr);
    const signatureJson = JSON.parse(fs.readFileSync(signaturePath, "utf8"));
    const chars = [...signatureJson.signature];
    chars[0] = chars[0] === "a" ? "b" : "a";
    signatureJson.signature = chars.join("");
    fs.writeFileSync(signaturePath, `${JSON.stringify(signatureJson)}\n`);
    const forged = run(["authenticity", "--public-key", publicKeyPath, "--signature", signaturePath]);
    assert.equal(forged.status, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
