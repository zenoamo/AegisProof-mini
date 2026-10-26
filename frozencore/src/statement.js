// SPDX-License-Identifier: GPL-3.0-or-later
import { BN254_SCALAR_FIELD } from "../../src/constants.js";
import { poseidonHash } from "../../src/commitment.js";
import { parseFieldElement } from "../../src/field.js";
import { InputError as FieldInputError } from "../../src/errors.js";
import { contextFieldFromBytes } from "../../src/statement.js";
import {
  DEFAULT_GUEST_PROGRAM,
  DOMAINS,
  MAX_128,
  MAX_160,
  MAX_64,
  PRIVATE_SIGNALS,
  PROTOCOL_VERSION,
  PUBLIC_SIGNALS,
} from "./constants.js";
import { InputError } from "./errors.js";

const SUPPLIED = new Set([
  ...PRIVATE_SIGNALS,
  "policyId",
  "policyVersion",
  "issuerId",
  "audienceId",
  "epoch",
  "issuedAt",
  "expiresAt",
  "programVersion",
  "executionId",
  "zkvmProgramId",
  "teeMeasurement",
  "verifierId",
  "protocolVersion",
  "chainId",
  "contractAddressField",
]);

function text(value) {
  return value.toString();
}

function read(value, label) {
  if (typeof value === "bigint") {
    if (value < 0n || value >= BN254_SCALAR_FIELD) {
      throw new InputError(`${label} がスカラーフィールドの範囲外です`);
    }
    return value;
  }
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

function bit(value, label) {
  if (value !== 0n && value !== 1n) throw new InputError(`${label} は 0 または 1 です`);
}

async function hash(inputs) {
  return BigInt(await poseidonHash(inputs));
}

async function depth1(leaf, sibling, pathBit) {
  const left = pathBit === 0n ? leaf : sibling;
  const right = pathBit === 0n ? sibling : leaf;
  return hash([DOMAINS.MERKLE, left, right]);
}

export async function guestProgramId(program = DEFAULT_GUEST_PROGRAM) {
  const inputs = [DOMAINS.ZKVM_PROGRAM, PROTOCOL_VERSION];
  for (const step of program) {
    inputs.push(step[0], step[1]);
  }
  return hash(inputs);
}

export function runGuest(program, inputSecret) {
  let r0 = 0n;
  let r1 = 0n;
  let halted = false;
  for (const [opcode, imm] of program) {
    if (halted) {
      if (opcode !== 3n) throw new InputError("停止後の命令が halt ではありません");
      continue;
    }
    if (opcode === 1n) {
      fit(inputSecret, MAX_64, "inputSecret");
      r0 = inputSecret;
    } else if (opcode === 2n) {
      bit(imm, "imm");
      const sum = r0 + imm;
      fit(sum, MAX_64, "guest add");
      r1 = sum;
    } else if (opcode === 3n) {
      halted = true;
    } else {
      throw new InputError("未知の guest opcode です");
    }
    fit(r0, MAX_64, "r0");
    fit(r1, MAX_64, "r1");
  }
  if (!halted) throw new InputError("guest が halt していません");
  return r1;
}

export async function statementFromParts(parts, program = DEFAULT_GUEST_PROGRAM) {
  if (!parts || typeof parts !== "object" || Array.isArray(parts)) {
    throw new InputError("入力オブジェクトが不正です");
  }
  for (const key of Object.keys(parts)) {
    if (!SUPPLIED.has(key)) throw new InputError("入力に未知のフィールドがあります");
  }
  const secret = read(parts.secret, "secret");
  const context = read(parts.context, "context");
  const subjectNonce = read(parts.subjectNonce, "subjectNonce");
  const inputSecret = read(parts.inputSecret, "inputSecret");
  const inputSalt = read(parts.inputSalt, "inputSalt");
  const authSecret = read(parts.authSecret, "authSecret");
  const outputSecret = read(parts.outputSecret, "outputSecret");
  const programBody = read(parts.programBody, "programBody");
  const revocationSibling = read(parts.revocationSibling, "revocationSibling");
  const revocationPathBit = read(parts.revocationPathBit, "revocationPathBit");
  const stateSibling = read(parts.stateSibling, "stateSibling");
  const statePathBit = read(parts.statePathBit, "statePathBit");
  const runtimeConfigWord = read(parts.runtimeConfigWord, "runtimeConfigWord");
  const policyId = read(parts.policyId, "policyId");
  const policyVersion = read(parts.policyVersion, "policyVersion");
  const issuerId = read(parts.issuerId, "issuerId");
  const audienceId = read(parts.audienceId, "audienceId");
  const epoch = read(parts.epoch, "epoch");
  const issuedAt = read(parts.issuedAt, "issuedAt");
  const expiresAt = read(parts.expiresAt, "expiresAt");
  const programVersion = read(parts.programVersion, "programVersion");
  const executionId = read(parts.executionId, "executionId");
  const teeMeasurement = read(parts.teeMeasurement, "teeMeasurement");
  const verifierId = read(parts.verifierId, "verifierId");
  const protocolVersion = read(parts.protocolVersion, "protocolVersion");
  const chainId = read(parts.chainId, "chainId");
  const contractAddressField = read(parts.contractAddressField, "contractAddressField");

  fit(inputSecret, MAX_64, "inputSecret");
  fit(policyId, MAX_128, "policyId");
  fit(policyVersion, MAX_128, "policyVersion");
  fit(issuerId, MAX_160, "issuerId");
  fit(audienceId, MAX_160, "audienceId");
  fit(epoch, MAX_64, "epoch");
  fit(issuedAt, MAX_64, "issuedAt");
  fit(expiresAt, MAX_64, "expiresAt");
  if (issuedAt >= expiresAt) throw new InputError("issuedAt は expiresAt より小さい必要があります");
  fit(programVersion, MAX_64, "programVersion");
  fit(executionId, MAX_128, "executionId");
  fit(verifierId, MAX_128, "verifierId");
  fit(chainId, MAX_64, "chainId");
  fit(contractAddressField, MAX_160, "contractAddressField");
  bit(revocationPathBit, "revocationPathBit");
  bit(statePathBit, "statePathBit");
  if (protocolVersion !== PROTOCOL_VERSION) throw new InputError("protocolVersion が一致しません");
  if (programVersion !== PROTOCOL_VERSION) throw new InputError("programVersion は guest の版 1 と一致する必要があります");

  const expectedOutput = runGuest(program, inputSecret);
  if (outputSecret !== expectedOutput) {
    throw new InputError("outputSecret が guest の実行結果と一致しません");
  }
  const computedProgramId = await guestProgramId(program);
  if (Object.hasOwn(parts, "zkvmProgramId") && read(parts.zkvmProgramId, "zkvmProgramId") !== computedProgramId) {
    throw new InputError("zkvmProgramId が guest プログラムと一致しません");
  }

  const commitment = await hash([DOMAINS.COMMITMENT, secret]);
  const subjectCommitment = await hash([DOMAINS.SUBJECT, secret, subjectNonce]);
  const contextHash = await hash([DOMAINS.CONTEXT, context]);
  const inputCommitment = await hash([DOMAINS.INPUT, inputSecret]);
  const inputRoot = await hash([DOMAINS.INPUT_ROOT, inputCommitment, inputSalt]);
  const authorizationCommitment = await hash([
    DOMAINS.AUTH,
    authSecret,
    policyId,
    policyVersion,
    issuerId,
    audienceId,
  ]);
  const revocationLeaf = await hash([DOMAINS.REV_LEAF, subjectCommitment, 0n]);
  const revocationRoot = await depth1(revocationLeaf, revocationSibling, revocationPathBit);
  const stateLeaf = await hash([DOMAINS.STATE_LEAF, subjectCommitment, epoch]);
  const stateRoot = await depth1(stateLeaf, stateSibling, statePathBit);
  const programHash = await hash([DOMAINS.PROGRAM, programVersion, programBody, computedProgramId]);
  const outputCommitment = await hash([DOMAINS.OUTPUT, outputSecret, executionId]);
  const zkvmProofCommitment = await hash([
    DOMAINS.ZKVM_BIND,
    computedProgramId,
    inputRoot,
    outputCommitment,
    executionId,
  ]);
  const runtimeConfigHash = await hash([DOMAINS.RUNTIME, runtimeConfigWord]);
  const attestationCommitment = await hash([
    DOMAINS.ATTEST,
    teeMeasurement,
    runtimeConfigHash,
    outputCommitment,
    executionId,
  ]);
  const domainSeparator = await hash([
    DOMAINS.SEPARATOR,
    protocolVersion,
    chainId,
    contractAddressField,
    verifierId,
  ]);
  const nullifier = await hash([
    DOMAINS.NULLIFIER,
    secret,
    contextHash,
    policyId,
    policyVersion,
    epoch,
    executionId,
    domainSeparator,
  ]);

  const publicValues = {
    commitment,
    nullifier,
    contextHash,
    subjectCommitment,
    inputCommitment,
    policyId,
    policyVersion,
    authorizationCommitment,
    issuerId,
    audienceId,
    epoch,
    issuedAt,
    expiresAt,
    revocationRoot,
    stateRoot,
    programHash,
    programVersion,
    inputRoot,
    outputCommitment,
    executionId,
    zkvmProgramId: computedProgramId,
    zkvmProofCommitment,
    teeMeasurement,
    attestationCommitment,
    runtimeConfigHash,
    verifierId,
    protocolVersion,
    chainId,
    contractAddressField,
    domainSeparator,
  };
  const publicSignals = PUBLIC_SIGNALS.map((name) => text(publicValues[name]));
  const witness = {
    secret: text(secret),
    context: text(context),
    subjectNonce: text(subjectNonce),
    inputSecret: text(inputSecret),
    inputSalt: text(inputSalt),
    authSecret: text(authSecret),
    outputSecret: text(outputSecret),
    programBody: text(programBody),
    revocationSibling: text(revocationSibling),
    revocationPathBit: text(revocationPathBit),
    stateSibling: text(stateSibling),
    statePathBit: text(statePathBit),
    runtimeConfigWord: text(runtimeConfigWord),
  };
  for (const name of PUBLIC_SIGNALS) witness[name] = publicSignals[PUBLIC_SIGNALS.indexOf(name)];
  return { witness, publicSignals, values: publicValues };
}

export { contextFieldFromBytes };
