// SPDX-License-Identifier: GPL-3.0-or-later
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPoseidon } from "circomlibjs";
import { ARTIFACTS, PROJECT_ROOT } from "../src/constants.js";
import { guestFromParts } from "../src/guest.js";
import { statementBindings } from "../src/review.js";
import { SAMPLE_PARTS } from "../src/sample.js";
import { statementFromParts } from "../src/statement.js";
import { verify } from "../src/verify.js";
import { verifyGuest } from "../src/guest-verify.js";

const poseidonPromise = buildPoseidon();

function domainConstants(source) {
  const found = {};
  for (const match of source.matchAll(/function (DOMAIN_[A-Z0-9_]+)\(\) \{ return (\d+); \}/g)) {
    found[match[1]] = BigInt(match[2]);
  }
  return found;
}

function pinnedProgram(source) {
  const words = [];
  for (let index = 0; index < 4; index += 1) {
    const opcode = source.match(new RegExp(`op${index} <== (\\d+);`));
    const immediate = source.match(new RegExp(`imm${index} <== (\\d+);`));
    assert.ok(opcode && immediate);
    words.push([BigInt(opcode[1]), BigInt(immediate[1])]);
  }
  return words;
}

function declaredPublic(source) {
  const match = source.match(/component main \{public \[([^\]]+)\]\}/);
  assert.ok(match);
  return match[1].split(",").map((name) => name.trim());
}

function symbolPublic(symText, names) {
  const lines = symText.split(/\r?\n/).filter((line) => line.length > 0);
  return names.map((name) => {
    const line = lines.find((item) => item.endsWith(`,main.${name}`));
    assert.ok(line);
    return { name, witnessIndex: Number(line.split(",")[0]) };
  });
}

async function poseidon(inputs) {
  const hasher = await poseidonPromise;
  return hasher.F.toObject(hasher(inputs)).toString();
}

async function circuitAccepts(wasmPath, input, accepts) {
  const calculatorPath = wasmPath.endsWith("guest.wasm")
    ? path.join(PROJECT_ROOT, "frozencore/dev/guest/guest_js/witness_calculator.js")
    : path.join(PROJECT_ROOT, "frozencore/dev/statement/statement_js/witness_calculator.js");
  const copy = path.join(os.tmpdir(), `frozencore-oracle-${process.pid}-${Math.random().toString(16).slice(2)}.cjs`);
  fs.copyFileSync(calculatorPath, copy);
  try {
    const require = createRequire(copy);
    const builder = require(copy);
    const calculator = await builder(fs.readFileSync(path.join(PROJECT_ROOT, wasmPath)));
    if (accepts) {
      await calculator.calculateWitness(input, 1);
      return true;
    }
    await assert.rejects(() => calculator.calculateWitness(input, 1), /Assert Failed/);
    return false;
  } finally {
    fs.rmSync(copy, { force: true });
  }
}

test("circuit source, schema, symbols, and verification keys agree on public order", () => {
  const guestSource = fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/circuit/guest.circom"), "utf8");
  const statementSource = fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/circuit/statement.circom"), "utf8");
  const guestPublic = declaredPublic(guestSource);
  const statementPublic = declaredPublic(statementSource);
  const schema = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/schema/public-signals-v1.json"), "utf8"));
  assert.deepEqual(guestPublic, ["zkvmProgramId", "inputRoot", "outputCommitment", "executionId"]);
  assert.equal(guestPublic.length, 4);
  assert.deepEqual(statementPublic, schema.order);
  assert.equal(statementPublic.length, 30);
  const guestSymbols = symbolPublic(fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/dev/guest/guest.sym"), "utf8"), guestPublic);
  const statementSymbols = symbolPublic(fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/dev/statement/statement.sym"), "utf8"), statementPublic);
  assert.deepEqual(guestSymbols.map((item) => item.witnessIndex), [1, 2, 3, 4]);
  assert.deepEqual(statementSymbols.map((item) => item.witnessIndex), statementPublic.map((_, index) => index + 1));
  const guestVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["guest.vk"]), "utf8"));
  const statementVk = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, ARTIFACTS["statement.vk"]), "utf8"));
  assert.equal(guestVk.nPublic, 4);
  assert.equal(guestVk.IC.length, 5);
  assert.equal(statementVk.nPublic, 30);
  assert.equal(statementVk.IC.length, 31);
});

test("guest and statement hashes match the circuit, not a copied API result", { timeout: 120000 }, async () => {
  const guestSource = fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/circuit/guest.circom"), "utf8");
  const statementSource = fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/circuit/statement.circom"), "utf8");
  const guestDomains = domainConstants(guestSource);
  const statementDomains = domainConstants(statementSource);
  const program = pinnedProgram(guestSource);
  assert.equal(program[0][0], 1n);
  assert.equal(program[1][1], 1n);
  const inputSecret = BigInt(SAMPLE_PARTS.inputSecret);
  const executionId = BigInt(SAMPLE_PARTS.executionId);
  const outputSecret = inputSecret + 1n;
  const programId = await poseidon([
    guestDomains.DOMAIN_ZKVM_PROGRAM,
    1n,
    ...program.flat(),
  ]);
  const inputCommitment = await poseidon([statementDomains.DOMAIN_INPUT, inputSecret]);
  const inputRoot = await poseidon([
    guestDomains.DOMAIN_INPUT_ROOT,
    BigInt(inputCommitment),
    BigInt(SAMPLE_PARTS.inputSalt),
  ]);
  const outputCommitment = await poseidon([
    guestDomains.DOMAIN_OUTPUT,
    outputSecret,
    executionId,
  ]);
  const commitment = await poseidon([statementDomains.DOMAIN_COMMITMENT, BigInt(SAMPLE_PARTS.secret)]);
  const zkvmProofCommitment = await poseidon([
    statementDomains.DOMAIN_ZKVM_BIND,
    BigInt(programId),
    BigInt(inputRoot),
    BigInt(outputCommitment),
    executionId,
  ]);
  assert.equal(guestDomains.DOMAIN_INPUT, statementDomains.DOMAIN_INPUT);
  assert.notEqual(guestDomains.DOMAIN_ZKVM_PROGRAM, statementDomains.DOMAIN_ZKVM_BIND);

  const guestInput = {
    inputSecret: inputSecret.toString(),
    inputSalt: SAMPLE_PARTS.inputSalt,
    outputSecret: outputSecret.toString(),
    executionId: executionId.toString(),
    zkvmProgramId: programId,
    inputRoot,
    outputCommitment,
  };
  assert.equal(await circuitAccepts(ARTIFACTS["guest.wasm"], guestInput, true), true);
  const guest = await guestFromParts({
    inputSecret: SAMPLE_PARTS.inputSecret,
    inputSalt: SAMPLE_PARTS.inputSalt,
    executionId: SAMPLE_PARTS.executionId,
  });
  assert.deepEqual(guest.publicSignals, [programId, inputRoot, outputCommitment, executionId.toString()]);

  const statement = await statementFromParts(SAMPLE_PARTS);
  const schema = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "frozencore/schema/public-signals-v1.json"), "utf8"));
  const at = (name) => statement.publicSignals[schema.order.indexOf(name)];
  assert.equal(at("commitment"), commitment);
  assert.equal(at("inputRoot"), inputRoot);
  assert.equal(at("outputCommitment"), outputCommitment);
  assert.equal(at("zkvmProgramId"), programId);
  assert.equal(at("zkvmProofCommitment"), zkvmProofCommitment);
  assert.equal(at("programVersion"), "1");
  assert.equal(await circuitAccepts(ARTIFACTS["statement.wasm"], statement.witness, true), true);
  await circuitAccepts(ARTIFACTS["statement.wasm"], { ...statement.witness, programVersion: "2" }, false);

  const bindings = await statementBindings({
    signalNames: schema.order,
    publicSignals: statement.publicSignals,
  });
  assert.equal(bindings.programVersionIsOne, at("programVersion") === "1");
  assert.equal(bindings.zkvmTupleBound, at("zkvmProofCommitment") === zkvmProofCommitment);

  const reordered = {
    schema: "frozencore-guest-journal-v1",
    version: "frozencore-guest-experimental-0.1.0",
    production: false,
    proofSystem: "groth16",
    curve: "bn254",
    signalNames: ["executionId", "outputCommitment", "inputRoot", "zkvmProgramId"],
    publicSignals: guest.publicSignals,
    proof: { protocol: "groth16", curve: "bn128" },
  };
  assert.equal(await verifyGuest(reordered), false);
  const short = { ...reordered, signalNames: ["zkvmProgramId", "inputRoot", "outputCommitment", "executionId"], publicSignals: guest.publicSignals.slice(0, 3) };
  assert.equal(await verifyGuest(short), false);
  const extra = {
    schema: "frozencore-public-signals-v1",
    version: "frozencore-experimental-0.1.0",
    production: false,
    proofSystem: "groth16",
    curve: "bn254",
    signalNames: schema.order,
    publicSignals: [...statement.publicSignals, "1"],
    proof: { protocol: "groth16", curve: "bn128" },
  };
  assert.equal(await verify(extra), false);
});
