# Reproducibility

このスナップショットで再現できるのは、コミットされた成果物に対する証明生成、検証、完全性検査、改ざん時の失敗です。開発用セレモニーのバイト列そのものを、別のマシンで完全に同じファイルとして再生成することは、再現の条件にしていません。

## 二つの再現

| 言っていること | 意味 | このリポジトリでの扱い |
| --- | --- | --- |
| 同一 ceremony の完全再現 | 同じ zkey と verification key のバイト列が、もう一度のビルドで必ず出る | 対象外。ビルドは公開ラベルに OS の CSPRNG を混ぜる。zkey と verification key のハッシュはビルドのたびに変わる |
| 各 build の内部整合性 | そのビルドが書いた wasm、r1cs、zkey、verification key と、そのビルドが書いた manifest が一致し、テストが通る | 検査条件。CI は `npm run build` のあと `npm test` と `npm run integrity` を実行し、スナップショットの zkey ハッシュとの一致は成功条件にしない |

手元のスナップショットを変えずに確認するコマンドは次です。

```bash
npm ci
npm test
npm run integrity
```

`npm run build` は別の開発用セレモニーです。実行すると、下の zkey、verification key、manifest のハッシュは変わります。wasm と r1cs は、同じ circom `2.2.3` と `circuit/main.circom` に対するコンパイル結果です。

## Toolchain

`package.json`、`artifacts/manifest.json`、回路から読める値です。

| 項目 | 値 |
| --- | --- |
| Node.js | `engines` は `>=20`。CI は Node.js 22。この manifest の `toolchain.node` は `v24.18.0` |
| circom | 回路の pragma は `2.2.2`。manifest の `circuit.circom` は `2.2.3` |
| snarkjs | `0.7.6` |
| circomlib | `2.0.5`（`Poseidon(1)`、`Poseidon(2)`、`Poseidon(5)`） |
| circomlibjs | `0.1.7` |
| Curve | BN254。snarkjs の曲線名は `bn128`。manifest の曲線名は `bn254` |
| Proof system | Groth16 |
| Constraints | 1767 |
| Private inputs | 2（`secret`、`context`） |
| Public inputs | 5（`commitment`、`nullifier`、`contextHash`、`policyId`、`epoch`） |
| Powers of tau | 11 |
| Contributors | 1 |
| `ceremony.production` | `false` |
| `toxicWastePersisted` | `false` |
| Public signal schema | `aegisproof-mini-public-signals-v2` |
| Version | `aegisproof-mini-0.2.0` |

PATH に circom `2.2.3` が無いとき、`scripts/build.js` は `tools/circom-2.2.3-sha256.json` にピンした公式バイナリを取得し、SHA-256 を確認してから使います。

## Artifact manifest

`artifacts/manifest.json` が持つ SHA-256 と、実ファイルの対応です。

| manifest の名前 | ファイル |
| --- | --- |
| `circuit.wasm` | `circuit/main.wasm` |
| `circuit.r1cs` | `circuit/main.r1cs` |
| `circuit.zkey` | `circuit/mini.zkey` |
| `verification_key.json` | `keys/verification_key.json` |

`artifacts/manifest.sha256` は `manifest.json` のバイト列の SHA-256 です。

2026-10-23 の作業ツリーで、実ファイルと `artifacts/manifest.json` と `artifacts/baseline.json` が一致している値です。コミット `90df4d2` のハッシュではありません。成果物をこの値へ合わせるための再ビルドは不要です。

```text
circuit.wasm              8997ccc90e7804613499ea89d71ac5d4b5f24ba17ad27131e8bede56112f4b29
circuit.r1cs              7fde21c78b0ad9ea61de29ab4f9d88b992d49762b80e8718c946ccdf8817be70
circuit.zkey              9c7cb878ff4f5ccbedef828d9ae4a10277a816c41b7d54d580652e8c1c07af1e
verification_key.json     b8242de2d49d00093709760c497c241e73429e35ceec4541800435ef7778e21f
manifest.json             94daf00e3ae4363449ca6b105b427f262aaef74120967339e431e7ae2b4f89bf
```

`npm run integrity` がこの対応を検査します。不一致のとき CLI は終了コード 2 で止まります。

## Commands

| コマンド | 役割 |
| --- | --- |
| `npm ci` | ロックファイルどおりに依存を入れる |
| `npm test` | `tests/**/*.test.js`。正常系、異常系、改ざん、ML-DSA、CLI |
| `npm run integrity` | manifest と成果物の SHA-256、および記録されたサイズ |
| `npm run keys:check` | 上に加え、r1cs の本数、zkey から書き出した verification key、`artifacts/baseline.json` |
| `npm run key-info` | `keys:check` と同じ検査の公開フィンガープリント |
| `npm run build` | コンパイルと新しい開発用セレモニー。baseline は更新しない |
| `npm run sepolia:test` | ローカル Solidity verifier。deployment があるときは Sepolia 上のコントラクトとの bool の一致も見る |

`.github/workflows/ci.yml` は Ubuntu の Node.js 22 で、`npm ci`、チェックアウトしたツリーに対する `npm run keys:check`、`npm run sepolia:test`、そのあとの `npm run build`、正常系、異常系、改ざん、ML-DSA、`npm run integrity`、世代分離、local-tee、frozencore を実行します。Sepolia のローカルテストは build より前です。build のあとの integrity と `test:positive` は、そのジョブが作り直した成果物の自己一致です。`test:positive` の鍵テストは zkey から書き出した verification key と、その時点の manifest を比べ、baseline の `manifest.sha256` とは比べません。checkout 直後の `keys:check` が、そのコミットの baseline との回帰です。

`.github/workflows/crypto-security.yml` は build しません。チェックアウトした wasm、r1cs、zkey、verification key、manifest、baseline に対して `keys:check`、integrity、正常系、異常系、改ざん、ML-DSA、世代分離、local-tee、frozencore、`npm run sepolia:test` を実行します。CodeQL は `.github/workflows/codeql.yml` で、暗号成果物の再生成とは別です。世代分離、local-tee、frozencore のソースがコミットに無いチェックアウトでは、そのステップは失敗します。

## Dev ceremony

セレモニーの公開ラベルはビルドスクリプトにあります。エントロピーには OS の CSPRNG が混ざります。そのため、ソースが同じでも zkey のバイト列は再実行で一致しません。

一致を期待してよいのは、ビルドし直していないツリーで、上のハッシュと `npm run integrity` と `npm run keys:check` が合うことです。ビルドし直したツリーで期待してよいのは、新しい manifest とそのファイルが互いと一致し、その鍵の下でテストが通ることです。その状態では `artifacts/baseline.json` とは一致しません。baseline の更新は、鍵の差し替えとして明示します。

zkey と verification key が毎回同じバイト列になるとは限りません。完全な byte-for-byte reproducibility は主張しません。分けるものは次です。

- 回路コンパイル。同じ circom `2.2.3` と `circuit/main.circom` に対する wasm と r1cs。コミットされたハッシュは `npm run integrity` が検査する
- 成果物の内部整合。そのビルドが書いたファイルと、そのビルドが書いた manifest
- 証明検証。その verification key の下で Groth16 が受理されるか
- 期待するメタデータ。制約数 1767、公開入力 5、秘密入力 2、Groth16、BN254 / snarkjs の `bn128`、`nPublic` 5。`npm run keys:check` が baseline と比べる
