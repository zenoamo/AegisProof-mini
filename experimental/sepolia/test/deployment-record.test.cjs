const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {
  EXPECTED_DEPLOYMENT,
  assertDeploymentRecord,
  assertPublicProof,
  readDeployment,
} = require("../scripts/deployment-record.cjs");

const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
const proofPath = path.join(__dirname, "../deployments/public-proof.json");

describe("Sepolia deployment record", function () {
  it("matches the recorded Sepolia deployment and verification", function () {
    const record = readDeployment(deploymentPath);
    assertDeploymentRecord(record);
    assert.equal(record.chainId, EXPECTED_DEPLOYMENT.chainId);
    assert.equal(record.contractAddress, EXPECTED_DEPLOYMENT.contractAddress);
    assert.equal(record.verification.transactionHash, EXPECTED_DEPLOYMENT.verification.transactionHash);
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    assertPublicProof(proof, record);
  });

  it("rejects metadata that points at another chain", function () {
    const record = readDeployment(deploymentPath);
    record.chainId = 1;
    assert.throws(() => assertDeploymentRecord(record), /11155111/);
  });
});