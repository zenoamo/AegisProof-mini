import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { sepoliaLiveComparisonEnabled } = require("../../experimental/sepolia/scripts/live-gate.cjs");

test("a configured RPC does not enable the Sepolia comparison by itself", () => {
  const env = { SEPOLIA_RPC_URL: "https://example.invalid" };
  assert.equal(sepoliaLiveComparisonEnabled(env, true), false);
  for (const flag of [undefined, "", "0", "true", "yes", "2"]) {
    assert.equal(sepoliaLiveComparisonEnabled({ ...env, AEGIS_SEPOLIA_LIVE: flag }, true), false);
  }
  assert.equal(sepoliaLiveComparisonEnabled({ ...env, AEGIS_SEPOLIA_LIVE: "1" }, true), true);
  assert.equal(sepoliaLiveComparisonEnabled({ ...env, AEGIS_SEPOLIA_LIVE: "1" }, false), false);
  assert.equal(sepoliaLiveComparisonEnabled({ AEGIS_SEPOLIA_LIVE: "1" }, true), false);
});

test("loading the Sepolia match file does not construct a provider without the live flag", () => {
  const matchPath = require.resolve("../../experimental/sepolia/test/sepolia-match.test.cjs");
  const probe = `
    const Module = require("node:module");
    const original = Module.prototype.require;
    let providers = 0;
    let described = 0;
    let skipped = 0;
    Module.prototype.require = function (id) {
      if (id === "hardhat") {
        return {
          ethers: {
            JsonRpcProvider: function () {
              providers += 1;
              return {};
            },
            toBeHex: () => "0x01",
          },
        };
      }
      return original.apply(this, arguments);
    };
    global.describe = () => { described += 1; };
    global.describe.skip = () => { skipped += 1; };
    process.env.SEPOLIA_RPC_URL = "http://127.0.0.1:9";
    delete process.env.AEGIS_SEPOLIA_LIVE;
    require(process.env.MATCH_PATH);
    if (providers !== 0 || described !== 0 || skipped !== 1) {
      console.error(JSON.stringify({ providers, described, skipped }));
      process.exit(2);
    }
    process.env.AEGIS_SEPOLIA_LIVE = "1";
    delete require.cache[process.env.MATCH_PATH];
    require(process.env.MATCH_PATH);
    if (providers !== 0 || described !== 1 || skipped !== 1) {
      console.error(JSON.stringify({ providers, described, skipped }));
      process.exit(3);
    }
    console.log("GATE_RUNTIME_OK");
  `;
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", probe], {
    env: { ...process.env, MATCH_PATH: matchPath },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GATE_RUNTIME_OK/);
});
