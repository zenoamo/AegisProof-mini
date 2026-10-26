// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import { MANIFEST_REL, MANIFEST_SHA_REL, VERSION } from "../constants.js";
import { sha256Bytes } from "./hash.js";

export function serializeManifest(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function writeManifest(root, document) {
  if (document.version !== VERSION) {
    throw new Error("manifest version が実装と一致しません");
  }
  if (!document.ceremony || document.ceremony.production !== false) {
    throw new Error("mini の manifest は production: false でなければなりません");
  }
  const artifactsDir = path.join(root, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const body = serializeManifest(document);
  const manifestPath = path.join(root, MANIFEST_REL);
  fs.writeFileSync(manifestPath, body);
  const digest = sha256Bytes(Buffer.from(body));
  fs.writeFileSync(path.join(root, MANIFEST_SHA_REL), `${digest}\n`);
  return digest;
}
