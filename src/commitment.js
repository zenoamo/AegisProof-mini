// SPDX-License-Identifier: GPL-3.0-or-later
import { buildPoseidon } from "circomlibjs";

let poseidonPromise;

function loadPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}

// Off-circuit Poseidon(1). Must match circomlib's Poseidon template.
export async function poseidonCommitment(secret) {
  if (typeof secret !== "bigint") {
    throw new TypeError("secret は bigint である必要があります");
  }
  const poseidon = await loadPoseidon();
  const hash = poseidon([secret]);
  return poseidon.F.toObject(hash).toString();
}
