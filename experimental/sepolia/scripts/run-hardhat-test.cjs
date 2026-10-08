const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const hardhat = path.join(root, "node_modules", "hardhat", "internal", "cli", "cli.js");
const child = spawn(
  process.execPath,
  [
    hardhat,
    "test",
    "--config",
    path.join(root, "experimental", "sepolia", "hardhat.config.cjs"),
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let output = "";
let settled = false;
let idle;

function finish(code) {
  if (settled) return;
  settled = true;
  if (idle) clearTimeout(idle);
  if (child.exitCode === null && child.signalCode === null) child.kill();
  process.exitCode = code;
}

function considerSummary() {
  if (!/\d+ passing/.test(output)) return;
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    const failing = /\d+ failing/.test(output);
    finish(failing ? 1 : 0);
  }, 4000);
}

child.stdout.on("data", (buf) => {
  process.stdout.write(buf);
  output += buf.toString();
  considerSummary();
});
child.stderr.on("data", (buf) => {
  process.stderr.write(buf);
  output += buf.toString();
  considerSummary();
});
child.on("exit", (code) => {
  if (settled) return;
  settled = true;
  if (idle) clearTimeout(idle);
  process.exit(code ?? 1);
});
