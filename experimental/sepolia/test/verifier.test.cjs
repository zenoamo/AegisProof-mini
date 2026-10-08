const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { createSample } = require("../scripts/sample-proof.cjs");

function bumpHex(value) {
  const next = BigInt(value) + 1n;
  return ethers.toBeHex(next, 32);
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
  });
});
