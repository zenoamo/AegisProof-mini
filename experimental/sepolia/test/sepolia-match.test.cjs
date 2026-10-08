const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const hre = require("hardhat");
const { ethers } = hre;
const { createSample } = require("../scripts/sample-proof.cjs");
const { assertDeploymentRecord, readDeployment } = require("../scripts/deployment-record.cjs");
const { assertSepoliaChain } = require("../scripts/load-env.cjs");

const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
const abi = [
  "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1]) view returns (bool)",
  "function publicSignalCount() view returns (uint256)",
];

function bumpHex(value) {
  return ethers.toBeHex(BigInt(value) + 1n, 32);
}

const SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const live = fs.existsSync(deploymentPath) && Boolean(process.env.SEPOLIA_RPC_URL);

(live ? describe : describe.skip)("deployed Sepolia verifier", function () {
  let local;
  let remote;
  let sample;
  let provider;
  let deployment;

  before(async function () {
    deployment = readDeployment(deploymentPath);
    assertDeploymentRecord(deployment);
    provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const network = await provider.getNetwork();
    assertSepoliaChain(network.chainId);
    remote = new ethers.Contract(deployment.contractAddress, abi, provider);
    sample = await createSample();
    const factory = await ethers.getContractFactory("AegisProofMiniSepolia");
    local = await factory.deploy();
    await local.waitForDeployment();
  });

  async function pair(args, expected) {
    const localResult = await local.verifyProof(args.pA, args.pB, args.pC, args.pubSignals);
    const remoteResult = await remote.verifyProof(args.pA, args.pB, args.pC, args.pubSignals);
    assert.equal(localResult, expected);
    assert.equal(remoteResult, expected);
    assert.equal(localResult, remoteResult);
  }

  it("matches a valid proof", async function () {
    await pair(sample.args, true);
  });

  it("matches a tampered proof", async function () {
    const args = { ...sample.args, pA: [bumpHex(sample.args.pA[0]), sample.args.pA[1]] };
    await pair(args, false);
  });

  it("matches a tampered commitment", async function () {
    const args = { ...sample.args, pubSignals: [bumpHex(sample.args.pubSignals[0])] };
    await pair(args, false);
  });

  it("matches a different public signal", async function () {
    let wrong = ethers.toBeHex(1n, 32);
    if (wrong.toLowerCase() === sample.args.pubSignals[0].toLowerCase()) {
      wrong = ethers.toBeHex(2n, 32);
    }
    await pair({ ...sample.args, pubSignals: [wrong] }, false);
  });

  it("reports one public signal on Sepolia", async function () {
    assert.equal(await remote.publicSignalCount(), 1n);
  });

  it("has bytecode at the recorded address", async function () {
    const code = await provider.getCode(deployment.contractAddress);
    assert.equal(code === "0x", false);
  });

  it("matches the recorded deployment and verification receipts", async function () {
    const deployed = await provider.getTransactionReceipt(deployment.deployTransactionHash);
    const verified = await provider.getTransactionReceipt(deployment.verification.transactionHash);
    assert.equal(deployed.status, 1);
    assert.equal(deployed.blockNumber, deployment.blockNumber);
    assert.equal(verified.status, 1);
    assert.equal(verified.blockNumber, deployment.verification.blockNumber);
    assert.equal(verified.to.toLowerCase(), deployment.contractAddress.toLowerCase());
  });

  it("matches an out-of-field public signal", async function () {
    const args = { ...sample.args, pubSignals: [ethers.toBeHex(SCALAR_FIELD, 32)] };
    await pair(args, false);
  });

  it("reverts a different public input arity on Sepolia", async function () {
    const other = new ethers.Interface([
      "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[2]) view returns (bool)",
    ]);
    const data = other.encodeFunctionData("verifyProof", [
      sample.args.pA,
      sample.args.pB,
      sample.args.pC,
      [sample.args.pubSignals[0], sample.args.pubSignals[0]],
    ]);
    await assert.rejects(() => provider.call({ to: deployment.contractAddress, data }));
  });
});
