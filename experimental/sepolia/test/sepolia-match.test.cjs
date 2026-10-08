const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const hre = require("hardhat");
const { ethers } = hre;
const { createSample } = require("../scripts/sample-proof.cjs");

const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
const abi = [
  "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1]) view returns (bool)",
  "function publicSignalCount() view returns (uint256)",
];

function bumpHex(value) {
  return ethers.toBeHex(BigInt(value) + 1n, 32);
}

const live = fs.existsSync(deploymentPath) && Boolean(process.env.SEPOLIA_RPC_URL);

(live ? describe : describe.skip)("deployed Sepolia verifier", function () {
  let local;
  let remote;
  let sample;

  before(async function () {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (deployment.chainId !== 11155111) {
      throw new Error("deployment が Sepolia ではありません");
    }
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 11155111) {
      throw new Error("RPC の chain id が 11155111 ではありません");
    }
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
});
