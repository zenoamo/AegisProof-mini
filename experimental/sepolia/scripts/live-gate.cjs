function sepoliaLiveComparisonEnabled(env, deploymentExists) {
  return env.AEGIS_SEPOLIA_LIVE === "1" && Boolean(deploymentExists) && Boolean(env.SEPOLIA_RPC_URL);
}

module.exports = { sepoliaLiveComparisonEnabled };
