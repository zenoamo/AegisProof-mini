// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from "node:crypto";
import fs from "node:fs";

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function canonicalArtifactPayload(artifacts) {
  const keys = Object.keys(artifacts).sort();
  const ordered = {};
  for (const key of keys) {
    ordered[key] = artifacts[key];
  }
  return JSON.stringify(ordered);
}

export function artifactDigest(artifacts) {
  return createHash("sha256").update(canonicalArtifactPayload(artifacts), "utf8").digest();
}
