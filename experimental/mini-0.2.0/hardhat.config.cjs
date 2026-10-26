const path = require("node:path");

require("@nomicfoundation/hardhat-ethers");

const root = __dirname;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: path.join(root, "contracts"),
    tests: path.join(root, "sepolia", "test"),
    cache: path.join(root, "hh-cache"),
    artifacts: path.join(root, "hh-artifacts"),
  },
  mocha: { timeout: 180000 },
};
