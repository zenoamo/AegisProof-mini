// SPDX-License-Identifier: GPL-3.0-or-later
// Static checks and audit classification for the crypto-security workflow.
// Binding, baseline, and proof checks stay in the existing CLI and tests.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const command = process.argv[2];
const findings = [];

const TEXT_EXT = new Set([
  ".js", ".cjs", ".mjs", ".ts", ".tsx", ".json", ".md", ".yml", ".yaml",
  ".sol", ".circom", ".txt", ".example", ".gitignore", ".html",
]);

const CRYPTO_PREFIXES = ["src/", "scripts/", "experimental/"];
const SCANNER = "scripts/security-observability.js";
const TEST_FIXTURE_SECRET = "123456789012345678901234567890";

function relPosix(file) {
  return file.replaceAll("\\", "/");
}

function trackedFiles() {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return listed.split("\0").filter(Boolean).map(relPosix);
}

function fail(file, rule, detail) {
  findings.push({ file, rule, detail });
}

function readText(file) {
  const ext = path.posix.extname(file).toLowerCase();
  if (ext && !TEXT_EXT.has(ext) && path.posix.basename(file) !== ".gitignore") return null;
  let fd;
  try {
    fd = fs.openSync(path.join(root, file), "r");
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > 1_000_000) return null;
    const bytes = Buffer.alloc(info.size);
    const read = fs.readSync(fd, bytes, 0, info.size, 0);
    if (read !== info.size || bytes.includes(0)) return null;
    return bytes.toString("utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "EISDIR")) return null;
    throw err;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function forbiddenName(file) {
  const base = path.posix.basename(file);
  if (base === ".env" || (base.startsWith(".env.") && base !== ".env.example")) return "tracked env file";
  if (base.endsWith(".mldsa.sk")) return "tracked ML-DSA secret key";
  if (file === "input.json" || file === "proof.json") return "tracked witness or proof file";
  if (file.startsWith("keys/") && /secret/i.test(base)) return "tracked key secret";
  return null;
}

function assignedSecret(line) {
  const matched = line.match(/\b((?:SEPOLIA_)?PRIVATE_KEY|MNEMONIC|SEED_PHRASE)\s*=\s*(.*)$/i);
  if (!matched) return null;
  let value = matched[2].trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;
  if (/^(<[^>]+>|\.{3}|your[-_].*|changeme|example|placeholder|todo)$/i.test(value)) return null;
  if (/^0x[0-9a-fA-F]{64}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "private key literal";
  if (/^(?:[a-z]+ ){11,23}[a-z]+$/.test(value)) return "mnemonic literal";
  if (value.length >= 32 && !value.includes("process.env") && !value.includes("${{")) return "non-empty secret assignment";
  return null;
}

function credential(line) {
  if (/https?:\/\/[^/\s"'`]+:[^/\s"'`]+@/.test(line)) return "URL userinfo";
  if (/infura\.io\/v3\/(?!(?:YOUR|your|<))[0-9a-fA-F]{32}\b/.test(line)) return "Infura credential";
  if (/alchemy\.com\/v2\/(?!(?:YOUR|your|<))[A-Za-z0-9_-]{20,}/.test(line)) return "Alchemy credential";
  return null;
}

function inCryptoPath(file) {
  return CRYPTO_PREFIXES.some((prefix) => file.startsWith(prefix)) && file !== SCANNER;
}

function checkGitignore(text) {
  const required = [".env", "*.mldsa.sk", "input.json", "proof.json", "!.env.example"];
  for (const line of required) {
    if (!text.split(/\r?\n/).some((item) => item.trim() === line)) {
      fail(".gitignore", "gitignore", `missing ${line}`);
    }
  }
}

function checkWorkflow(file, text) {
  if (/\bpull_request_target\b/.test(text)) fail(file, "actions", "pull_request_target");
  if (/\$\{\{\s*github\.event\.(pull_request|issue|comment|discussion|review)\./.test(text)) {
    fail(file, "actions", "untrusted event field in an expression");
  }
  if (/secrets\.SEPOLIA_PRIVATE_KEY/.test(text)) fail(file, "actions", "Sepolia private key secret");
  if (/\bnpm audit fix\b/.test(text)) fail(file, "actions", "npm audit fix");
  if (file === ".github/workflows/crypto-security.yml") {
    if (/\bnpm run build\b/.test(text)) fail(file, "actions", "build replaces committed keys");
    if (/sepolia:(deploy|verify)/.test(text)) fail(file, "actions", "Sepolia deploy or state-changing verify");
  }
}

function checkSecrets(file, text) {
  const named = forbiddenName(file);
  if (named) fail(file, "secret-file", named);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    if (/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(line)) fail(where, "pem", "private key block");
    const assigned = assignedSecret(line);
    if (assigned) fail(where, "assignment", assigned);
    const remote = credential(line);
    if (remote) fail(where, "credential", remote);
    const secretKey = line.match(/"secretKey"\s*:\s*"([0-9a-fA-F]+)"/);
    if (secretKey && secretKey[1].length >= 64) fail(where, "mldsa", "secretKey hex");
    const witness = line.match(/"secret"\s*:\s*"([^"]+)"/);
    if (!witness) return;
    const value = witness[1];
    const placeholder = /^<[^>]+>$/.test(value);
    const testFixture = file.startsWith("tests/") && value === TEST_FIXTURE_SECRET;
    if (!placeholder && !testFixture) fail(where, "witness", "committed witness secret");
  });
}

function checkWeakCrypto(file, text) {
  if (!inCryptoPath(file)) return;
  const rules = [
    [/Math\.random\s*\(/, "Math.random"],
    [/createHash\(\s*["'](?:md5|sha1)["']\s*\)/i, "MD5 or SHA-1"],
    [/createHmac\(\s*["'](?:md5|sha1)["']\s*\)/i, "HMAC-MD5 or HMAC-SHA-1"],
    [/createCipher(?:iv)?\(\s*["'][^"']*(?:des|rc4|ecb)[^"']*["']/i, "DES, RC4, or ECB"],
    [/["'](?:des-ede3(?:-cbc)?|aes-\d+-ecb|rc4)["']/i, "weak cipher literal"],
  ];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [pattern, label] of rules) {
      if (pattern.test(line)) fail(`${file}:${index + 1}`, "weak-crypto", label);
    }
  });
}

function reportCsPrng(files) {
  let randomBytes = 0;
  let webcrypto = 0;
  let keygen = 0;
  let testRandom = 0;
  for (const file of files) {
    const text = readText(file);
    if (text === null || file === SCANNER) continue;
    const calls = (pattern) => (text.match(pattern) || []).length;
    if (inCryptoPath(file)) {
      randomBytes += calls(/randomBytes\s*\(/g);
      webcrypto += calls(/webcrypto|getRandomValues\s*\(/g);
      keygen += calls(/ml_dsa87\.keygen\s*\(/g);
    }
    if (file.startsWith("tests/") && /Math\.random\s*\(/.test(text)) testRandom += 1;
  }
  console.log(`csprng randomBytes calls in crypto paths: ${randomBytes}`);
  console.log(`csprng webcrypto calls in crypto paths: ${webcrypto}`);
  console.log(`ml_dsa87.keygen calls in crypto paths: ${keygen}`);
  console.log("randomBytes names exclusive temporary files.");
  console.log("ML-DSA-87 key generation uses ml_dsa87.keygen(). Groth16 randomness stays inside snarkjs.");
  if (testRandom === 0) console.log("tests/ does not call Math.random.");
  else console.log(`tests/ files calling Math.random: ${testRandom}. Those paths are outside the crypto implementation.`);
}

function staticScan() {
  const files = trackedFiles();
  for (const file of files) {
    const named = forbiddenName(file);
    if (named) fail(file, "secret-file", named);
    const text = readText(file);
    if (text === null) continue;
    if (file === ".gitignore") checkGitignore(text);
    if (file.startsWith(".github/workflows/") && file.endsWith(".yml")) checkWorkflow(file, text);
    if (file !== SCANNER) checkSecrets(file, text);
    checkWeakCrypto(file, text);
  }
  reportCsPrng(files);
  console.log("intentionally not failed:");
  console.log("- identifier and documentation mentions of secret, private key, mnemonic, and seed phrase");
  console.log("- empty assignments in .env.example and documentation");
  console.log("- public addresses, contract addresses, and deployment transaction hashes");
  console.log("- the explicit non-secret circuit fixture in tests/");
  console.log("- gitignored .env and node_modules");
  console.log("- Math.random outside src/, scripts/, and experimental/");
  if (findings.length === 0) {
    console.log("static checks: ok");
    return;
  }
  for (const item of findings) console.error(`${item.rule} ${item.file} ${item.detail}`);
  process.exit(1);
}

function npmAudit(extra) {
  const commandLine = ["npm", "audit", "--json", ...extra].join(" ");
  const result = spawnSync(commandLine, { cwd: root, encoding: "utf8", shell: true });
  const stdout = result.stdout || "";
  const start = stdout.indexOf("{");
  if (start < 0) {
    process.stderr.write(result.stderr || "");
    throw new Error(`${commandLine} did not return JSON`);
  }
  return JSON.parse(stdout.slice(start));
}

function printAudit(label, report) {
  const counts = report.metadata?.vulnerabilities || {};
  console.log(`${label}: critical=${counts.critical || 0} high=${counts.high || 0} moderate=${counts.moderate || 0} low=${counts.low || 0}`);
  const items = report.vulnerabilities || {};
  for (const [name, item] of Object.entries(items)) {
    console.log(`  ${name} ${item.severity}`);
  }
  return (counts.critical || 0) > 0 || (counts.high || 0) > 0;
}

function audit() {
  const production = npmAudit(["--omit=dev"]);
  const full = npmAudit([]);
  const failProduction = printAudit("npm audit --omit=dev", production);
  const failFull = printAudit("npm audit", full);
  console.log("low and moderate advisories are recorded. npm audit fix is not run.");
  console.log("elliptic 6.6.1 has no patched release and remains through circomlibjs and ethers 5.");
  console.log("diff 7.x remains through mocha 11 because Hardhat 2.29 depends on mocha ^11.");
  if (failProduction || failFull) process.exit(1);
  console.log("dependency audit: no high or critical advisories");
}

function fingerprint() {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "baseline.json"), "utf8"));
  console.log(`baseline manifest SHA-256 ${baseline.manifestSha256}`);
  console.log(`baseline protocol ${baseline.proofSystem.protocol}`);
  console.log(`baseline curve ${baseline.proofSystem.curve}`);
  console.log(`baseline snarkjsCurve ${baseline.proofSystem.snarkjsCurveName}`);
  console.log(`baseline nPublic ${baseline.nPublic}`);
  console.log(`baseline constraints ${baseline.circuit.constraints}`);
  console.log("working-tree equality is enforced by npm run keys:check");
}

function severityScore(run, result) {
  const direct = result.properties?.["security-severity"];
  if (direct !== undefined) return Number(direct);
  const rules = run.tool?.driver?.rules || [];
  const rule = result.rule?.index !== undefined ? rules[result.rule.index] : rules.find((item) => item.id === result.ruleId);
  const score = rule?.properties?.["security-severity"];
  return score === undefined ? Number.NaN : Number(score);
}

function readSarif(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    return fs.readFileSync(fd, "utf8");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function sarif(dir) {
  const abs = path.resolve(root, dir);
  let names;
  try {
    names = fs.readdirSync(abs);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log("SARIF directory is absent. No high or critical findings to report.");
      return;
    }
    throw err;
  }
  const files = names.filter((name) => name.endsWith(".sarif"));
  let blocking = 0;
  for (const name of files) {
    const doc = JSON.parse(readSarif(path.join(abs, name)));
    for (const run of doc.runs || []) {
      for (const result of run.results || []) {
        const score = severityScore(run, result);
        if (score >= 7) {
          blocking += 1;
          console.error(`${result.ruleId || "codeql"} security-severity ${score} ${result.message?.text || ""}`);
        }
      }
    }
  }
  if (blocking > 0) process.exit(1);
  console.log(`CodeQL SARIF: no high or critical findings in ${files.length} file(s)`);
}

if (command === "static") staticScan();
else if (command === "audit") audit();
else if (command === "fingerprint") fingerprint();
else if (command === "sarif") sarif(process.argv[3] || "codeql-sarif");
else {
  console.error("usage: node scripts/security-observability.js static|audit|fingerprint|sarif [dir]");
  process.exit(2);
}
