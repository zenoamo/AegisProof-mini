const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
const { ethers } = hre;
const { loadProjectEnv, redact } = require("./load-env.cjs");

const EXPECTED_CHAIN_ID = 11155111;
const root = path.resolve(__dirname, "../../..");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  loadProjectEnv(root);
  const rpc = process.env.SEPOLIA_RPC_URL;
  if (!rpc) {
    fail("SEPOLIA_RPC_URL が設定されていません");
    return;
  }
  if (!process.env.SEPOLIA_PRIVATE_KEY) {
    fail("SEPOLIA_PRIVATE_KEY が設定されていません");
    return;
  }

  if (hre.network.name !== "sepolia") {
    fail("Hardhat network が sepolia ではありません");
    return;
  }
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  const address = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(address);

  console.log("network", network.name);
  console.log("chainId", chainId);
  console.log("deployer", address);
  console.log("balanceWei", balance.toString());

  if (chainId === 1) {
    fail("mainnet への接続を拒否しました");
    return;
  }
  if (chainId !== EXPECTED_CHAIN_ID) {
    fail("chain id が 11155111 ではありません");
    return;
  }
  if (network.name && network.name !== "unknown" && network.name !== "sepolia") {
    fail("network 名が Sepolia ではありません");
    return;
  }

  const factory = await ethers.getContractFactory("AegisProofMiniSepolia");
  const artifact = await hre.artifacts.readArtifact("AegisProofMiniSepolia");
  const unsigned = await factory.getDeployTransaction();
  if (!unsigned.data || unsigned.data !== artifact.bytecode) {
    fail("デプロイ bytecode がコンパイル成果物と一致しません");
    return;
  }
  const gas = await deployer.estimateGas(unsigned);
  const fee = await ethers.provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  if (!price) {
    fail("ガス価格を取得できません");
    return;
  }
  const needed = gas * price;
  console.log("estimatedGas", gas.toString());
  console.log("neededWei", needed.toString());
  if (balance < needed) {
    console.error("Sepolia ETH が不足しているためデプロイを停止しました");
    console.error("deployer", address);
    console.error("balanceWei", balance.toString());
    console.error("neededWei", needed.toString());
    console.error(
      "公式 faucet: https://www.alchemy.com/faucets/ethereum-sepolia https://www.infura.io/faucet/sepolia https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
    );
    process.exitCode = 2;
    return;
  }

  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  const receipt = await tx.wait();
  const contractAddress = await contract.getAddress();
  if (receipt.status !== 1) {
    fail("デプロイトランザクションが失敗しました");
    return;
  }
  const code = await ethers.provider.getCode(contractAddress);
  if (code === "0x") {
    fail("デプロイ先に bytecode がありません");
    return;
  }
  const count = await contract.publicSignalCount();
  if (count !== 1n) {
    fail("publicSignalCount が 1 ではありません");
    return;
  }

  const record = {
    network: "sepolia",
    chainId: EXPECTED_CHAIN_ID,
    contractAddress,
    deployer: address,
    deployTransactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
    publicSignalCount: 1,
    explorer: {
      contract: `https://sepolia.etherscan.io/address/${contractAddress}`,
      deployTransaction: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
    },
  };
  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "sepolia.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log("contractAddress", contractAddress);
  console.log("deployTransactionHash", receipt.hash);
  console.log("blockNumber", receipt.blockNumber);
  console.log("status", receipt.status);
  console.log("gasUsed", receipt.gasUsed.toString());
}

main().catch((err) => {
  console.error(redact(err));
  process.exit(1);
});
