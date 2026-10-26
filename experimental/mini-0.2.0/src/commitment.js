// SPDX-License-Identifier: GPL-3.0-or-later
import { buildPoseidon } from "circomlibjs";
import { BN254_SCALAR_FIELD } from "./constants.js";

let poseidonPromise;

function loadPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}

function assertFieldElement(value) {
  if (typeof value !== "bigint" || value < 0n || value >= BN254_SCALAR_FIELD) {
    throw new TypeError("Poseidon 入力がスカラーフィールドの範囲外です");
  }
}

// Off-circuit Poseidon. The input length must match the circomlib template.
export async function poseidonHash(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1) {
    throw new TypeError("Poseidon 入力は bigint の配列である必要があります");
  }
  for (const value of inputs) assertFieldElement(value);
  const poseidon = await loadPoseidon();
  const hash = poseidon(inputs);
  return poseidon.F.toObject(hash).toString();
}

// Poseidon(secret). This is the same commitment function as protocol 0.1.0.
export async function poseidonCommitment(secret) {
  if (typeof secret !== "bigint") {
    throw new TypeError("secret は bigint である必要があります");
  }
  return poseidonHash([secret]);
}
