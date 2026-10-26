const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { loadProjectEnv, redact, normalizePrivateKey, assertSepoliaChain, assertConfiguredVerifier } = require("./load-env.cjs");

const root = path.resolve(__dirname, "../../..");
const deploymentPath = path.join(__dirname, "../deployments/sepolia.json");
const proofPath = path.join(__dirname, "../deployments/public-proof.json");
const abi = [
  "function verifyAndRecord(uint256[2],uint256[2][2],uint256[2],uint256[1]) returns (bool)",
  "function lastValid() view returns (bool)",
  "function lastCommitment() view returns (uint256)",
  "event VerificationRecorded(uint256 indexed commitment, bool valid, address indexed sender)",
];

async function main() {
  loadProjectEnv(root);
  if (!process.env.SEPOLIA_RPC_URL) throw new Error("SEPOLIA_RPC_URL が設定されていません");
  const key = normalizePrivateKey(process.env.SEPOLIA_PRIVATE_KEY);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (deployment.chainId !== 11155111) throw new Error("deployment が Sepolia ではありません");
  assertConfiguredVerifier(deployment.contractAddress);

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const network = await provider.getNetwork();
  assertSepoliaChain(network.chainId);
  const wallet = new ethers.Wallet(key, provider);
  if (wallet.address.toLowerCase() !== deployment.deployer.toLowerCase()) {
    throw new Error("送信元アドレスが deployment の deployer と一致しません");
  }

  const contract = new ethers.Contract(deployment.contractAddress, abi, wallet);
  const tx = await contract.verifyAndRecord(proof.pA, proof.pB, proof.pC, proof.pubSignals);
  const receipt = await tx.wait();
  const valid = await contract.lastValid();
  const commitment = await contract.lastCommitment();

  deployment.verification = {
    transactionHash: receipt.hash,
    from: receipt.from,
    to: receipt.to,
    chainId: 11155111,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    lastValid: valid,
    lastCommitment: commitment.toString(),
    explorer: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
  };
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log("transactionHash", receipt.hash);
  console.log("from", receipt.from);
  console.log("to", receipt.to);
  console.log("chainId", 11155111);
  console.log("blockNumber", receipt.blockNumber);
  console.log("status", receipt.status);
  console.log("gasUsed", receipt.gasUsed.toString());
  console.log("lastValid", valid);
  console.log("lastCommitment", commitment.toString());
  process.exit(receipt.status !== 1 || valid !== true ? 1 : 0);
}

main().catch((err) => {
  console.error(redact(err));
  process.exit(1);
});
