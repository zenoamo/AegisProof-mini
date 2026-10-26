// SPDX-License-Identifier: GPL-3.0-or-later
import { BN254_SCALAR_FIELD } from "./constants.js";
import { InputError } from "./errors.js";

const DECIMAL = /^(0|[1-9][0-9]*)$/;

export function parseFieldElement(value, label) {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new InputError(`${label} は10進文字列である必要があります`);
  }
  const parsed = BigInt(value);
  if (parsed >= BN254_SCALAR_FIELD) {
    throw new InputError(`${label} がスカラーフィールドの範囲外です`);
  }
  return parsed;
}

export function isCanonicalFieldString(value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) return false;
  try {
    return BigInt(value) < BN254_SCALAR_FIELD;
  } catch {
    return false;
  }
}
