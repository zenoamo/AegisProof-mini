const path = require("node:path");
const { loadProjectEnv } = require("./scripts/load-env.cjs");

loadProjectEnv(path.resolve(__dirname, "../.."));

require("@nomicfoundation/hardhat-ethers");

function accounts() {
  const raw = process.env.SEPOLIA_PRIVATE_KEY;
  if (!raw) return [];
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return [];
  return [hex];
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: path.join(__dirname, "contracts"),
    tests: path.join(__dirname, "test"),
    cache: path.join(__dirname, "cache"),
    artifacts: path.join(__dirname, "hh-artifacts"),
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: accounts(),
    },
  },
  mocha: { timeout: 180000 },
};
