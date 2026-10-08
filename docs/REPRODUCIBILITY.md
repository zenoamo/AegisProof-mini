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
| circomlib | `2.0.5`（`Poseidon(1)`） |
| circomlibjs | `0.1.7` |
| Curve | BN254。snarkjs の曲線名は `bn128`。manifest の曲線名は `bn254` |
| Proof system | Groth16 |
| Constraints | 415 |
| Private inputs | 1（`secret`） |
| Public inputs | 1（`commitment`） |
| Powers of tau | 9 |
| Contributors | 1 |
| `ceremony.production` | `false` |
| `toxicWastePersisted` | `false` |
| Public signal schema | `aegisproof-mini-public-signals-v1` |
| Version | `aegisproof-mini-0.1.0` |

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

この作業ツリーで manifest と一致している値です。

```text
circuit.wasm              16fdc8b9caed938299b530a6ebc9885dfdf49abe3c2d73d5cbb9ed1531fb79ea
circuit.r1cs              29027acc31b3440d5a8b42df2be4e7db2ef86b543b69823b2bd5c9b896d1516e
circuit.zkey              5b6a568c2ff858df76d6b09c4dd3eb8779a2ebf121f02d42ffc400ed9e207ac9
verification_key.json     cad6c28700b34d60159ee1ab40c91878d0436aa677d6a97741dacea5803b0485
manifest.json             538900e955f6eda641fa0dc801b2559b8edb9b5bab106c8ff62a7f166e3438e5
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

CI は Ubuntu の Node.js 22 で、`npm ci`、コミット済みツリーに対する `npm run keys:check`、そのあとの `npm run build`、正常系、異常系、改ざん、ML-DSA、`npm run integrity` を実行します。build のあとの integrity と `test:positive` は、そのジョブが作り直した成果物の自己一致です。`test:positive` の鍵テストは zkey から書き出した verification key と、その時点の manifest を比べ、baseline の `manifest.sha256` とは比べません。checkout 直後の `keys:check` が、コミットされた baseline との回帰です。

## Dev ceremony

セレモニーの公開ラベルはビルドスクリプトにあります。エントロピーには OS の CSPRNG が混ざります。そのため、ソースが同じでも zkey のバイト列は再実行で一致しません。

一致を期待してよいのは、ビルドし直していないツリーで、上のハッシュと `npm run integrity` と `npm run keys:check` が合うことです。ビルドし直したツリーで期待してよいのは、新しい manifest とそのファイルが互いと一致し、その鍵の下でテストが通ることです。その状態では `artifacts/baseline.json` とは一致しません。baseline の更新は、鍵の差し替えとして明示します。

zkey と verification key が毎回同じバイト列になるとは限りません。完全な byte-for-byte reproducibility は主張しません。分けるものは次です。

- 回路コンパイル。同じ circom `2.2.3` と `circuit/main.circom` に対する wasm と r1cs。コミットされたハッシュは `npm run integrity` が検査する
- 成果物の内部整合。そのビルドが書いたファイルと、そのビルドが書いた manifest
- 証明検証。その verification key の下で Groth16 が受理されるか
- 期待するメタデータ。制約数 415、公開入力 1、秘密入力 1、Groth16、BN254 / snarkjs の `bn128`、`nPublic` 1。`npm run keys:check` が baseline と比べる
