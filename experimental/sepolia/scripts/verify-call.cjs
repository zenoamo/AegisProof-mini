const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { loadProjectEnv, redact } = require("./load-env.cjs");
const { createSample } = require("./sample-proof.cjs");

const root = path.resolve(__dirname, "../../..");
const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
const abi = [
  "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1]) view returns (bool)",
  "function publicSignalCount() view returns (uint256)",
];

async function main() {
  loadProjectEnv(root);
  if (!process.env.SEPOLIA_RPC_URL) throw new Error("SEPOLIA_RPC_URL が設定されていません");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.chainId !== 11155111) throw new Error("deployment が Sepolia ではありません");

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 11155111) {
    throw new Error("RPC の chain id が 11155111 ではありません");
  }

  const sample = await createSample();
  const contract = new ethers.Contract(deployment.contractAddress, abi, provider);
  const count = await contract.publicSignalCount();
  const valid = await contract.verifyProof(
    sample.args.pA,
    sample.args.pB,
    sample.args.pC,
    sample.args.pubSignals,
  );
  const tampered = await contract.verifyProof(
    sample.args.pA,
    sample.args.pB,
    sample.args.pC,
    [ethers.toBeHex(BigInt(sample.args.pubSignals[0]) + 1n, 32)],
  );

  const proofPath = path.join(__dirname, "../deployments/public-proof.json");
  fs.writeFileSync(
    proofPath,
    `${JSON.stringify(
      {
        publicSignals: sample.publicSignals,
        pA: sample.args.pA,
        pB: sample.args.pB,
        pC: sample.args.pC,
        pubSignals: sample.args.pubSignals,
      },
      null,
      2,
    )}\n`,
  );

  console.log("chainId", Number(network.chainId));
  console.log("contractAddress", deployment.contractAddress);
  console.log("publicSignalCount", count.toString());
  console.log("verifyProof", valid);
  console.log("tamperedCommitment", tampered);
  process.exit(count !== 1n || valid !== true || tampered !== false ? 1 : 0);
}

main().catch((err) => {
  console.error(redact(err));
  process.exit(1);
});
