const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { createSample } = require("../scripts/sample-proof.cjs");

function bumpHex(value) {
  return ethers.toBeHex(BigInt(value) + 1n, 32);
}

describe("AegisProofMiniStatement", function () {
  let verifier;
  let sample;
  let owner;

  before(async function () {
    [owner] = await ethers.getSigners();
    sample = await createSample();
    const factory = await ethers.getContractFactory("AegisProofMiniStatement");
    verifier = await factory.deploy();
    await verifier.waitForDeployment();
    await (await verifier.connect(owner).setEpoch(BigInt(sample.epoch))).wait();
    await (await verifier.connect(owner).setPolicyAllowed(BigInt(sample.policyId), true)).wait();
  });

  it("reports five public signals in the statement order", async function () {
    assert.equal(await verifier.publicSignalCount(), 5n);
    assert.equal(sample.publicSignals.length, 5);
    assert.equal(sample.args.pubSignals.length, 5);
  });

  it("consumes a valid proof once", async function () {
    const { pA, pB, pC, pubSignals } = sample.args;
    assert.equal(await verifier.verifyProof(pA, pB, pC, pubSignals), true);
    const tx = await verifier.verifyAndConsume(pA, pB, pC, pubSignals);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    assert.equal(await verifier.usedNullifiers(BigInt(sample.nullifier)), true);
    await assert.rejects(verifier.verifyAndConsume(pA, pB, pC, pubSignals), /nullifier used/);
  });

  it("rejects a tampered proof and does not consume the nullifier", async function () {
    const fresh = await createSample({ context: 12n });
    const tampered = [bumpHex(fresh.args.pA[0]), fresh.args.pA[1]];
    assert.equal(await verifier.verifyProof(tampered, fresh.args.pB, fresh.args.pC, fresh.args.pubSignals), false);
    await assert.rejects(
      verifier.verifyAndConsume(tampered, fresh.args.pB, fresh.args.pC, fresh.args.pubSignals),
      /invalid proof/,
    );
    assert.equal(await verifier.usedNullifiers(BigInt(fresh.nullifier)), false);
  });

  it("rejects a different epoch and an unapproved policy", async function () {
    const epoch = [...sample.args.pubSignals];
    epoch[4] = bumpHex(epoch[4]);
    await assert.rejects(
      verifier.verifyAndConsume(sample.args.pA, sample.args.pB, sample.args.pC, epoch),
      /epoch rejected/,
    );
    const policy = [...sample.args.pubSignals];
    policy[3] = bumpHex(policy[3]);
    await assert.rejects(
      verifier.verifyAndConsume(sample.args.pA, sample.args.pB, sample.args.pC, policy),
      /policy rejected/,
    );
  });
});
