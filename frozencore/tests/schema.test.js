// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ARTIFACTS, PROJECT_ROOT, PUBLIC_SIGNALS } from "../src/constants.js";
import { statementFromParts } from "../src/statement.js";
import { SAMPLE_PARTS } from "../src/sample.js";
import { InputError } from "../src/errors.js";

test("the sym file lists the 30 public signals in schema order", () => {
  const sym = fs.readFileSync(path.join(PROJECT_ROOT, path.dirname(ARTIFACTS["statement.r1cs"]), "statement.sym"), "utf8");
  const names = sym.split(/\r?\n/).slice(0, 30).map((line) => line.split(",").at(-1).replace(/^main\./, ""));
  assert.deepEqual(names, [...PUBLIC_SIGNALS]);
});

test("a sample statement exposes 30 canonical signals", async () => {
  const statement = await statementFromParts(SAMPLE_PARTS);
  assert.equal(statement.publicSignals.length, 30);
  assert.deepEqual(PUBLIC_SIGNALS.map((name) => statement.witness[name]), statement.publicSignals);
  assert.equal(statement.values.protocolVersion, 1n);
  assert.notEqual(statement.values.inputCommitment, statement.values.inputRoot);
  assert.notEqual(statement.values.programHash, statement.values.zkvmProgramId);
});

test("range, version, and guest-result mismatches are rejected before a proof", async () => {
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, expiresAt: "1000" }), InputError);
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, programVersion: "2" }), InputError);
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, outputSecret: "8" }), InputError);
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, protocolVersion: "2" }), InputError);
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, chainId: "0x1" }), InputError);
  await assert.rejects(() => statementFromParts({ ...SAMPLE_PARTS, unknown: "1" }), InputError);
});

test("artifact paths stay inside frozencore", () => {
  for (const rel of Object.values(ARTIFACTS)) {
    assert.equal(rel.startsWith("frozencore/"), true);
  }
});
