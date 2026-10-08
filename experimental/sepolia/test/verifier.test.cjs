const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { createSample } = require("../scripts/sample-proof.cjs");

const SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function bumpHex(value) {
  const next = BigInt(value) + 1n;
  return ethers.toBeHex(next, 32);
}

async function rejectsCall(data, to) {
  await assert.rejects(() => ethers.provider.call({ to, data }));
}

describe("AegisProofMiniSepolia", function () {
  let verifier;
  let sample;

  before(async function () {
    sample = await createSample();
    const factory = await ethers.getContractFactory("AegisProofMiniSepolia");
    verifier = await factory.deploy();
    await verifier.waitForDeployment();
  });

  it("reports one public signal", async function () {
    assert.equal(await verifier.publicSignalCount(), 1n);
    assert.equal(await verifier.lastValid(), false);
    assert.equal(await verifier.lastCommitment(), 0n);
    assert.equal(await verifier.lastSender(), ethers.ZeroAddress);
  });

  it("accepts a valid proof and commitment", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    assert.equal(await verifier.verifyProof(pA, pB, pC, pubSignals), true);
  });

  it("rejects a tampered proof", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    const tampered = [bumpHex(pA[0]), pA[1]];
    assert.equal(await verifier.verifyProof(tampered, pB, pC, pubSignals), false);
  });

  it("rejects a tampered commitment", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    assert.equal(await verifier.verifyProof(pA, pB, pC, [bumpHex(pubSignals[0])]), false);
  });

  it("rejects a public signal outside the scalar field", async function () {
    const { pA, pB, pC } = sample.args;
    assert.equal(await verifier.verifyProof(pA, pB, pC, [ethers.toBeHex(SCALAR_FIELD, 32)]), false);
  });

  it("rejects a tampered pB and pC", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    const tamperedB = [[bumpHex(pB[0][0]), pB[0][1]], pB[1]];
    const tamperedC = [bumpHex(pC[0]), pC[1]];
    assert.equal(await verifier.verifyProof(pA, tamperedB, pC, pubSignals), false);
    assert.equal(await verifier.verifyProof(pA, pB, tamperedC, pubSignals), false);
  });

  it("reverts when the public input count does not match the ABI", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    const to = await verifier.getAddress();
    const other = new ethers.Interface([
      "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[2]) view returns (bool)",
    ]);
    const data = other.encodeFunctionData("verifyProof", [pA, pB, pC, [pubSignals[0], pubSignals[0]]]);
    await rejectsCall(data, to);
    await rejectsCall(verifier.interface.getFunction("verifyProof").selector, to);
    assert.equal(await verifier.lastValid(), false);
  });

  it("rejects a different public signal", async function () {
    const { pA, pB, pC } = sample.args;
    const wrong = [ethers.toBeHex(1n, 32)];
    if (wrong[0].toLowerCase() === sample.args.pubSignals[0].toLowerCase()) {
      wrong[0] = ethers.toBeHex(2n, 32);
    }
    assert.equal(await verifier.verifyProof(pA, pB, pC, wrong), false);
  });

  it("records a valid verification in a transaction", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    const tx = await verifier.verifyAndRecord(pA, pB, pC, pubSignals);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    assert.equal(await verifier.lastValid(), true);
    assert.equal(await verifier.lastCommitment(), BigInt(pubSignals[0]));
    assert.equal(await verifier.lastSender(), receipt.from);
  });

  it("overwrites state when a later proof is rejected", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    const tampered = [bumpHex(pubSignals[0])];
    const tx = await verifier.verifyAndRecord(pA, pB, pC, tampered);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    assert.equal(await verifier.lastValid(), false);
    assert.equal(await verifier.lastCommitment(), BigInt(tampered[0]));
  });

  it("records the same valid proof again", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    const tx = await verifier.verifyAndRecord(pA, pB, pC, pubSignals);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    assert.equal(await verifier.lastValid(), true);
    assert.equal(await verifier.lastCommitment(), BigInt(pubSignals[0]));
  });
});
