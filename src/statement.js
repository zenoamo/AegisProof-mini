// SPDX-License-Identifier: GPL-3.0-or-later
import { BN254_SCALAR_FIELD } from "./constants.js";
import { poseidonCommitment, poseidonHash } from "./commitment.js";
import { InputError } from "./errors.js";

// Domain tags shared with circuit/main.circom. They are public constants.
export const CONTEXT_DOMAIN = 2n;
export const NULLIFIER_DOMAIN = 3n;
export const CONTEXT_BYTES_MAX = 31;

function canonical(value) {
  return value.toString();
}

// Unique big-endian encoding. A longer buffer with a leading zero is rejected,
// so 0x01 and 0x0001 are not two encodings of the same field element.
// Zero is the single byte 0x00. Empty input is rejected. Maximum length is 31 bytes.
export function contextFieldFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new InputError("context は Uint8Array である必要があります");
  }
  if (bytes.length < 1 || bytes.length > CONTEXT_BYTES_MAX) {
    throw new InputError("context バイト列の長さが不正です");
  }
  if (bytes.length > 1 && bytes[0] === 0) {
    throw new InputError("context バイト列に先頭ゼロがあります");
  }
  let value = 0n;
  for (const byte of bytes) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new InputError("context バイト列が不正です");
    }
    value = (value << 8n) + BigInt(byte);
  }
  if (value >= BN254_SCALAR_FIELD) {
    throw new InputError("context がスカラーフィールドの範囲外です");
  }
  return value;
}

export function contextFieldFromUtf8(text) {
  if (typeof text !== "string") {
    throw new InputError("context 文字列が不正です");
  }
  return contextFieldFromBytes(new TextEncoder().encode(text));
}

export async function contextHashFromField(context) {
  return poseidonHash([CONTEXT_DOMAIN, context]);
}

export async function nullifierFromParts({ secret, contextHash, policyId, epoch }) {
  return poseidonHash([
    NULLIFIER_DOMAIN,
    secret,
    contextHash,
    policyId,
    epoch,
  ]);
}

// Private inputs are secret and context. Public outputs follow PUBLIC_SIGNALS.
export async function statementFromParts({ secret, context, policyId, epoch }) {
  const commitment = await poseidonCommitment(secret);
  const contextHash = await contextHashFromField(context);
  const nullifier = await nullifierFromParts({
    secret,
    contextHash: BigInt(contextHash),
    policyId,
    epoch,
  });
  const policy = canonical(policyId);
  const epochText = canonical(epoch);
  return {
    secret: canonical(secret),
    context: canonical(context),
    policyId: policy,
    epoch: epochText,
    commitment,
    contextHash,
    nullifier,
    publicSignals: [commitment, nullifier, contextHash, policy, epochText],
  };
}
