# Architecture

AegisProof-mini は、一つの公開値に対する Groth16 証明と、その証明に使う回路成果物の検査を、別の層として持っています。本番システムではなく、AegisProof v2 の Frozen Core でもありません。

## 証明の経路

回路は `circuit/main.circom` です。private input は `secret`、public input は `commitment`、制約は `commitment === Poseidon(secret)` です。`Poseidon` は circomlib の `Poseidon(1)` です。manifest に記録された制約数は 415 です。

```text
Input
↓
Poseidon commitment
↓
Minimal Circom circuit
↓
Groth16 proof
↓
publicSignals[commitment]
↓
Verifier
```

`src/prover/prove.js` は、完全性検査のあと `snarkjs.groth16.fullProve` で証明を作ります。witness ファイルは書きません。`secret` は証明封筒のフィールドにしません。

`src/verifier/verify.js` は、スキーマと完全性検査のあと `snarkjs.groth16.verify` を呼びます。`publicSignals` は長さ 1 の canonical な体元素文字列です。スキーマ名は `aegisproof-mini-public-signals-v1` です。30 個の公開信号は拒否します。

曲線は BN254 です。snarkjs が証明オブジェクトと verification key に書く名前は `bn128`、manifest と証明封筒が書く名前は `bn254` です。

## 四つの質問

次の四つは、別の質問に答えます。

| 名前 | 見ているもの | 成功が意味すること |
| --- | --- | --- |
| Cryptographic proof | Groth16 / BN254 | 同梱の verification key の下で、公開 `commitment` に対する証明が受理された |
| Artifact integrity | SHA-256 manifest | 手元の wasm、r1cs、zkey、verification key、manifest が、記録されたハッシュと一致する |
| Artifact authenticity | ML-DSA-87 | 成果物ハッシュ一覧のダイジェストが、呼び出し側の渡した公開鍵の署名と一致する |
| On-chain verification | Ethereum Sepolia | 同じ Groth16 検証を、テストネット上の Solidity verifier が実行した |

`prove` は `verify` を呼ばず、`verify` は証明を作りません。`verify` は ML-DSA を呼びません。Sepolia のコントラクトは SHA-256 も ML-DSA-87 も実行しません。

## Integrity

```text
circuit/main.wasm
circuit/main.r1cs
circuit/mini.zkey
keys/verification_key.json
        ↓
artifacts/manifest.json          四つの SHA-256
        ↓
artifacts/manifest.sha256        manifest.json 自身の SHA-256
```

`src/integrity/check.js` は、`manifest.sha256`、manifest の version / protocol / curve / `ceremony.production === false` / 成果物名、各ファイルのハッシュ、記録があるときは path とサイズの順に見ます。不一致では `prove`、`verify`、`integrity`、`sign` を止めます。検査を外すフラグはありません。

`src/integrity/keys.js` の `checkArtifactBinding` は、そのあと `snarkjs.r1cs.info` と `snarkjs.zKey.exportVerificationKey` で、その時点の r1cs、zkey、verification key、manifest の対応を見ます。`checkKeyBinding` はそれに加え、`artifacts/baseline.json` と比べます。baseline はコミットされたスナップショットのアンカーで、ビルドは更新しません。`ci.yml` の `test:positive` は build のあとなので、baseline との一致ではなく `checkArtifactBinding` を使います。`crypto-security.yml` は build せず、同じ `keys:check` をコミット済みツリーに対して実行します。powers-of-tau に対する `zkey verify` は、ビルド中にそのファイルがあるときだけです。詳細は [KEY_MANAGEMENT.md](KEY_MANAGEMENT.md) です。

CodeQL（`.github/workflows/codeql.yml`）は JavaScript / TypeScript と GitHub Actions の一般的な検査です。Groth16 の受理、成果物の SHA-256、ML-DSA-87 の成否は見ません。その三層は既存の CLI とテストが担当し、crypto-security workflow がコミット済みツリーで繰り返します。役割の対応は [SECURITY.md](../SECURITY.md) にあります。

Poseidon commitment は、回路の中の `secret` のコミットメントです。wasm や zkey のハッシュではありません。

SHA-256 manifest は、ファイルのバイト列が記録と一致するかを見ます。Groth16 証明が受理されること自体は証明しません。manifest と対象ファイルをまとめて差し替えられる状況では、外部の信頼の根にもなりません。

## Authenticity

`src/authenticity/mldsa.js` は任意の artifact authenticity layer です。署名対象は、成果物ハッシュをキー名でソートした JSON の UTF-8 に対する SHA-256 です。コンテキストは `aegisproof-mini/manifest-authenticity/v1` です。実装は `@noble/post-quantum` `0.7.1` の `ml_dsa87` です。

このリポジトリは信頼する ML-DSA 公開鍵を同梱していません。どの鍵を信頼するかはツールの外です。ML-DSA-87 は証明方式の置換ではありません。

## Experimental Sepolia

```text
AegisProof-mini
↓
Solidity Groth16 verifier
↓
Ethereum Sepolia
```

`experimental/sepolia/scripts/export-verifier.js` は、`circuit/mini.zkey` から書き出した検証鍵が `keys/verification_key.json` と一致することを確認し、snarkjs の Groth16 Solidity テンプレートで `Groth16Verifier.sol` を生成します。公開信号は 1 個なので、`verifyProof` の引数は `uint[1]` です。

`AegisProofMiniSepolia` はその verifier を継承します。`publicSignalCount()` は 1 です。証明座標は `snarkjs.groth16.exportSolidityCallData` の出力を使います。

`verifyProof` は view です。結果をトランザクションとして残す関数が `verifyAndRecord` です。生成 verifier は assembly の `return` で呼び出し全体を終えるため、`verifyAndRecord` は `staticcall` 経由で `verifyProof` を呼び、返った bool と commitment を保存します。

チェーンへ送るのは証明と公開 `commitment` です。`secret` はオンチェーンに送りません。

この層は extension / experimental layer です。Core の回路、prover、verifier、integrity、authenticity、既存の zkey と verification key を置き換えません。埋め込まれた検証鍵は、開発用の単一貢献者セレモニーの鍵です。

## AegisProof v2 との境界

mini の公開信号は `commitment` の 1 個です。AegisProof v2 の 30 フィールド claims structure は移植していません。その形の入力は検証で拒否します。v2 の `production.zkey`、WASM、R1CS はこのツリーに無く、使いません。

## モジュール

| 経路 | モジュール |
| --- | --- |
| 証明生成 | `src/prover/prove.js` |
| 検証 | `src/verifier/verify.js` |
| 完全性 | `src/integrity/check.js` |
| 真正性 | `src/authenticity/mldsa.js` |
| CLI | `src/cli/index.js` |
| Sepolia | `experimental/sepolia/` |
