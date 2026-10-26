# Statement 30 公開シグナルの採用判断

記録日: 2026-10-09。これは採用決定ではない。公開シグナルの名前、個数、順序、および回路は、この文書では変更していない。

現行の作業ツリーにある Statement は、スキーマ `frozencore-public-signals-v1`、版 `frozencore-experimental-0.1.0`、`production: false` である。開発用 R1CS の制約数はマニフェストの 13082、公開入力 30、非公開入力 13 である。`programVersion === 1` は `circuit/statement.circom` の回路制約である。

## 現行の文

公開信号はすべて BN254 スカラーの正規十進文字列である。順序は `frozencore/schema/public-signals-v1.json` の `order` と同一である。

1. `commitment` から `inputCommitment` までは、ドメイン 16 から 19 の Poseidon 像である。回路は前像の知識を拘束し、秘密の権限や入力の真正性は拘束しない。
2. `policyId`、`policyVersion`、`issuerId`、`audienceId` は範囲つきの公開整数で、`authorizationCommitment`（ドメイン 21）に入る。署名検証はしない。
3. `epoch`、`issuedAt`、`expiresAt` は 64 bit 以内である。回路は `issuedAt < expiresAt` だけを見る。壁時計は見ない。
4. `revocationRoot` と `stateRoot` は深さ 1 の包含である。sibling は証明者が選ぶ。外部の失効集合や状態機関は見ない。
5. `programHash` はドメイン 23 で、`programVersion`、非公開の `programBody`、`zkvmProgramId` を束ねる。`programVersion` は 1 でなければならない。
6. `inputRoot`、`outputCommitment`、`executionId`、`zkvmProgramId` は Guest と共有する公開値である。`inputRoot` はドメイン 20、`outputCommitment` はドメイン 22 である。statement 回路は guest を再実行しない。
7. `zkvmProofCommitment` は Poseidon(31, zkvmProgramId, inputRoot, outputCommitment, executionId) である。これは四つの公開値の結合であり、ZKVM 証明の検証結果ではない。Guest の program id に入る第二入力のリテラル 1 は、statement の `programVersion` とは別の定数である。
8. `teeMeasurement` と `attestationCommitment`（ドメイン 30）は計測タプルの結合である。quote の検証ではない。
9. `runtimeConfigHash` は非公開語 1 個の像である。
10. `protocolVersion` は回路定数 1 である。`domainSeparator` は Poseidon(25, protocolVersion, chainId, contractAddressField, verifierId) で、nullifier にも入る。chain id やコントラクトアドレスとの照合は回路の外である。

Guest の公開順序は `zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` の 4 個である。`reviewPair` は、この四つが文字列として一致すること、両方の Groth16、`programVersion === "1"`、`zkvmProofCommitment` の再計算を、別々の条件として持つ。外部 6 項目が未設定のとき `externallyComplete` と `verified` は false である。

## mini との違い

`src/foundation.js` は世代を混ぜない。

| プロファイル | 公開信号 | この作業ツリーで検証できるか | 接続 |
| --- | --- | --- | --- |
| mini 0.1.0 | `commitment` の 1 個。`Poseidon(secret)` | できない。ローカル再受け入れは `undecided`。Sepolia の既存契約は 1 信号のまま | `verifyStatement` は現行の検証器へ回さない |
| mini 0.2.0 | commitment、nullifier、contextHash、policyId、epoch の 5 個 | できる。mini 自身の zkey | FrozenCore の 30 信号検証器では検証しない |
| FrozenCore Statement | 上の 30 個。commitment は Poseidon(16, secret) | 開発用鍵でのみできる。本番鍵は無い | `verifyStatement` はスキーマと版が一致するときだけ `frozencore/src/verify.js` へ渡す |
| FrozenCore Guest | 共有 4 個 | 開発用鍵でのみできる | `verifyStatement` は Guest を Statement として検証しない |

mini の証明と FrozenCore の証明は交換できない。ドメインが違い、信号数も違う。

## 採用する場合と、旧仕様を残す場合

30 信号を正式な Statement にする場合でも、mini 0.1.0 の 1 信号と mini 0.2.0 の 5 信号は別プロファイルのまま残る。正式化は、既存の Sepolia 契約や mini の鍵を 30 信号へ読み替えることではない。

採用するときに残るリスクは次である。

- 期限、失効、状態、署名、ZKVM、attestation は回路の外で、信頼元が未設定である。Groth16 の成功をそれらの検証済みと読めない。
- `zkvmProofCommitment` と `attestationCommitment` は結合ハッシュである。
- 開発用の単一貢献者 zkey を、正式仕様の本番鍵として使えない。
- 回路や信号順を変えると、現行の開発用 R1CS と zkey は無効になる。その変更はこの文書の範囲外である。

判断に必要な承認は、30 信号をどの利用の正式な文にするか、mini 0.1.0 をローカルに戻すか、外部 6 項目の信頼元を何か、の三つである。このリポジトリは三つとも未決定のままである。
