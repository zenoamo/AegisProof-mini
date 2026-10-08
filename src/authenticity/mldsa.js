// SPDX-License-Identifier: GPL-3.0-or-later
import { ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";
import { ML_DSA_ALGORITHM, ML_DSA_CONTEXT } from "../constants.js";
import { AuthenticityError } from "../errors.js";
import { artifactDigest } from "../integrity/hash.js";

const textEncoder = new TextEncoder();

function contextBytes() {
  return textEncoder.encode(ML_DSA_CONTEXT);
}

function requireBytes(value, label) {
  if (!(value instanceof Uint8Array)) {
    throw new AuthenticityError(`${label} がバイト列ではありません`);
  }
  return value;
}

export function generateKeyPair() {
  const { secretKey, publicKey } = ml_dsa87.keygen();
  if (secretKey.length !== ml_dsa87.lengths.secretKey || publicKey.length !== ml_dsa87.lengths.publicKey) {
    throw new AuthenticityError("ML-DSA-87 鍵の長さが不正です");
  }
  return { secretKey, publicKey, algorithm: ML_DSA_ALGORITHM };
}

export function digestArtifacts(artifacts) {
  const digest = artifactDigest(artifacts);
  if (digest.length !== 32) throw new AuthenticityError("ダイジェスト長が不正です");
  return digest;
}

export function signDigest(secretKey, digest) {
  requireBytes(secretKey, "秘密鍵");
  requireBytes(digest, "ダイジェスト");
  if (secretKey.length !== ml_dsa87.lengths.secretKey || digest.length !== 32) {
    throw new AuthenticityError("署名入力の長さが不正です");
  }
  const signature = ml_dsa87.sign(digest, secretKey, {
    context: contextBytes(),
    extraEntropy: false,
  });
  if (!(signature instanceof Uint8Array) || signature.length !== ml_dsa87.lengths.signature) {
    throw new AuthenticityError("ML-DSA-87 署名の長さが不正です");
  }
  return signature;
}

export function verifyDigest(publicKey, signature, digest) {
  try {
    if (!(publicKey instanceof Uint8Array) || publicKey.length !== ml_dsa87.lengths.publicKey) return false;
    if (!(signature instanceof Uint8Array) || signature.length !== ml_dsa87.lengths.signature) return false;
    if (!(digest instanceof Uint8Array) || digest.length !== 32) return false;
    return ml_dsa87.verify(signature, digest, publicKey, { context: contextBytes() }) === true;
  } catch {
    return false;
  }
}

export function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

export function fromHex(hex, expectedLength) {
  if (typeof hex !== "string" || !/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new AuthenticityError("16進文字列が不正です");
  }
  const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new AuthenticityError("16進文字列の長さが不正です");
  }
  return bytes;
}
