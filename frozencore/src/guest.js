// SPDX-License-Identifier: GPL-3.0-or-later
import { poseidonHash } from "../../src/commitment.js";
import { parseFieldElement } from "../../src/field.js";
import { InputError as FieldInputError } from "../../src/errors.js";
import {
  DEFAULT_GUEST_PROGRAM,
  DOMAINS,
  GUEST_PUBLIC_SIGNALS,
  MAX_128,
  MAX_64,
} from "./constants.js";
import { InputError } from "./errors.js";
import { guestProgramId, runGuest } from "./statement.js";

const SUPPLIED = new Set(["inputSecret", "inputSalt", "outputSecret", "executionId"]);

function text(value) {
  return value.toString();
}

function read(value, label) {
  try {
    return parseFieldElement(value, label);
  } catch (error) {
    if (error instanceof FieldInputError) throw new InputError(error.message);
    throw error;
  }
}

function fit(value, max, label) {
  if (value > max) throw new InputError(`${label} が許可された範囲外です`);
}

// Builds the witness for the fixed load / add-1 / halt / halt guest.
// outputSecret is the final r1. Callers may supply a wrong value; the circuit then rejects it.
export async function guestFromParts(parts) {
  if (!parts || typeof parts !== "object" || Array.isArray(parts)) {
    throw new InputError("入力オブジェクトが不正です");
  }
  for (const key of Object.keys(parts)) {
    if (!SUPPLIED.has(key)) throw new InputError("入力に未知のフィールドがあります");
  }
  const inputSecret = read(parts.inputSecret, "inputSecret");
  const inputSalt = read(parts.inputSalt, "inputSalt");
  const executionId = read(parts.executionId, "executionId");
  fit(inputSecret, MAX_64, "inputSecret");
  fit(executionId, MAX_128, "executionId");
  const expectedOutput = runGuest(DEFAULT_GUEST_PROGRAM, inputSecret);
  const outputSecret = Object.hasOwn(parts, "outputSecret")
    ? read(parts.outputSecret, "outputSecret")
    : expectedOutput;
  fit(outputSecret, MAX_64, "outputSecret");

  const inputCommitment = BigInt(await poseidonHash([DOMAINS.INPUT, inputSecret]));
  const inputRoot = BigInt(await poseidonHash([DOMAINS.INPUT_ROOT, inputCommitment, inputSalt]));
  const outputCommitment = BigInt(await poseidonHash([DOMAINS.OUTPUT, outputSecret, executionId]));
  const zkvmProgramId = await guestProgramId(DEFAULT_GUEST_PROGRAM);

  const publicValues = {
    zkvmProgramId,
    inputRoot,
    outputCommitment,
    executionId,
  };
  const publicSignals = GUEST_PUBLIC_SIGNALS.map((name) => text(publicValues[name]));
  const witness = {
    inputSecret: text(inputSecret),
    inputSalt: text(inputSalt),
    outputSecret: text(outputSecret),
  };
  for (const name of GUEST_PUBLIC_SIGNALS) {
    witness[name] = publicSignals[GUEST_PUBLIC_SIGNALS.indexOf(name)];
  }
  return {
    witness,
    publicSignals,
    values: publicValues,
    expectedOutput,
  };
}
