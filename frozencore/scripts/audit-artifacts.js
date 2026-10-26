// SPDX-License-Identifier: GPL-3.0-or-later
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditArtifacts, rebuildInTemp } from "../src/audit.js";
import { assessProductionReadiness } from "../src/readiness.js";

function describe(report) {
  const lines = [];
  lines.push(report.ok ? "既存成果物の監査は通過しました。本番セレモニーではありません" : "既存成果物の監査は失敗しました");
  lines.push(`failures ${report.failures.length}`);
  for (const item of report.failures) lines.push(`${item.code} ${item.role ?? "-"} ${item.detail}`);
  for (const role of Object.values(report.roles)) {
    if (!role.circuit) continue;
    lines.push(`${role.id} constraints=${role.circuit.constraints} public=${role.circuit.publicInputs} verifyFromR1cs=${role.cryptographic.verifyFromR1cs}`);
  }
  return lines;
}

function describeReadiness(report) {
  const lines = [];
  lines.push(report.ready ? "本番移行の前提は揃っています" : "本番移行ゲートは未通過です。開発用の状態を本番完了とは扱いません");
  lines.push(`unmet ${report.unmet.join(",")}`);
  return lines;
}

export async function execute(argv = process.argv, deps = {}) {
  const audit = deps.auditArtifacts ?? auditArtifacts;
  const rebuildFn = deps.rebuildInTemp ?? rebuildInTemp;
  const assess = deps.assessProductionReadiness ?? assessProductionReadiness;
  const gate = argv.includes("--production-readiness");
  const runAudit = !gate || argv.includes("--audit") || argv.includes("--rebuild") || argv.includes("--mode");
  const modeIndex = argv.indexOf("--mode");
  const options = { confineToRoot: true };
  if (modeIndex >= 0) options.mode = argv[modeIndex + 1];
  let report = null;
  const lines = [];
  if (runAudit) {
    report = await audit(options);
    lines.push(...describe(report));
  }
  let rebuildReport = null;
  if (argv.includes("--rebuild")) {
    rebuildReport = await rebuildFn();
    lines.push(rebuildReport.ok ? "R1CS と WASM の再ビルドは一致しました。zkey のバイト一致は要求していません" : "再ビルド検証は失敗しました");
    lines.push(`rebuild stage ${rebuildReport.stage}`);
    for (const item of rebuildReport.failures) lines.push(`${item.code} ${item.role ?? "-"} ${item.detail}`);
  }
  let readiness = null;
  if (gate) {
    readiness = await assess();
    lines.push(...describeReadiness(readiness));
  }
  const payload = { audit: report, rebuild: rebuildReport };
  if (gate) payload.readiness = readiness;
  let exitCode = 0;
  if (runAudit && report?.ok !== true) exitCode = 1;
  else if (argv.includes("--rebuild") && rebuildReport?.ok !== true) exitCode = 1;
  else if (gate && readiness?.ready !== true) exitCode = 2;
  return { exitCode, payload, lines };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await execute();
  for (const text of result.lines) console.log(`[audit] ${text}`);
  console.log(JSON.stringify(result.payload));
  process.exit(result.exitCode);
}
