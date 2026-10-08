// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ARTIFACTS, MANIFEST_REL, MANIFEST_SHA_REL, PROJECT_ROOT } from "../src/constants.js";
import { poseidonCommitment } from "../src/commitment.js";
import { prove } from "../src/prover/prove.js";

export const TEST_SECRET = "123456789012345678901234567890";

export async function validInput(secret = TEST_SECRET) {
  const commitment = await poseidonCommitment(BigInt(secret));
  return { secret, commitment };
}

let cached;
export function validEnvelope() {
  if (!cached) {
    cached = (async () => {
      const input = await validInput();
      return { input, envelope: await prove(input) };
    })();
  }
  return cached;
}

export async function withTempInstall(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "aegisproof-mini-"));
  try {
    for (const rel of [...Object.values(ARTIFACTS), MANIFEST_REL, MANIFEST_SHA_REL]) {
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(PROJECT_ROOT, rel), dest);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function flipFirstByte(file) {
  const buf = Buffer.from(fs.readFileSync(file));
  if (buf.length < 1) throw new Error("empty artifact");
  buf[0] ^= 0xff;
  fs.writeFileSync(file, buf);
}

export function assertNoSecretKey(value) {
  if (!value || typeof value !== "object") return;
  if (Object.prototype.hasOwnProperty.call(value, "secret") || Object.prototype.hasOwnProperty.call(value, "secretKey")) {
    throw new Error("出力に秘密値が含まれています");
  }
  for (const item of Object.values(value)) {
    if (item && typeof item === "object") assertNoSecretKey(item);
  }
}
