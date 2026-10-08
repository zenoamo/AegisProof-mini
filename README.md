# AegisProof-mini

A minimal, reproducible reference implementation for experimenting with Groth16 proof generation, verification, and artifact integrity.

秘密値の Poseidon commitment に対する Groth16 証明を作り、その証明を検証し、回路成果物の SHA-256 が manifest と一致するかを確認する実験用の実装です。本番システムではありません。

## 2. Important: AegisProof-mini is NOT AegisProof v2

```text
AegisProof mini is NOT AegisProof v2.

AegisProof mini is an experimental / development
reference implementation intended for testing,
education, integration prototyping, and architecture
validation.

It must not be treated as a replacement for the
production AegisProof v2 system.
```

このリポジトリは AegisProof v2 の Frozen Core を含まず、それを変更しません。`production.zkey`、v2 の WASM、v2 の R1CS は使いません。公開信号は v2 の 30 フィールドではなく、`commitment` の 1 個です。

## 3. What does it prove?

回路 `circuit/main.circom` が検査する命題は次の一つです。

> 秘密値 `secret` を知っていて、その Poseidon commitment が公開値 `commitment` と一致する。

```text
private input: secret
public input:  commitment
constraint:    commitment === Poseidon(secret)
publicSignals: [commitment]
```

`Poseidon` は circomlib の `Poseidon(1)` です。証明に載る公開値は `commitment` だけです。`secret` は証明ファイルへ書きません。

検証が成功すると、その公開 `commitment` について、同梱の verification key の下で Groth16 証明が受理された、という意味です。この鍵は開発用の単一貢献者セレモニーで作られているため、本番の健全性を主張するものではありません。詳細は Security assumptions を見てください。

## 4. Architecture

証明の流れと、成果物の流れは別です。

```text
secret
  ↓
Poseidon(secret)
  ↓
commitment          ← publicSignals の唯一の要素
  ↓
Groth16 / BN254
  ↓
proof.json
  ↓
verifier            ← snarkjs.groth16.verify
```

```text
circuit.wasm
circuit.r1cs
circuit.mini.zkey
verification_key.json
  ↓
SHA-256 manifest    ← prove / verify / integrity が照合する
  ↓
optional ML-DSA-87  ← sign / authenticity。verify は呼ばない
```

実装の分担は次のとおりです。

| 経路 | モジュール | 役割 |
| --- | --- | --- |
| 証明生成 | `src/prover/prove.js` | 完全性確認のあと Groth16 証明を作る |
| 検証 | `src/verifier/verify.js` | 完全性確認のあと Groth16 証明を検証する |
| 完全性 | `src/integrity/check.js` | manifest とファイルの SHA-256 を比べる |
| 真正性 | `src/authenticity/mldsa.js` | 成果物ダイジェストへ ML-DSA-87 署名を付ける |

`prove` は `verify` を呼ばず、`verify` は証明を作りません。`verify` は ML-DSA を呼びません。

## 5. Three different security layers

三つの層は別の質問に答えます。

| Layer | Purpose |
| --- | --- |
| Groth16 | 数学的な命題の証明と検証。公開 `commitment` に対し、Poseidon 関係を満たす `secret` を知っていること |
| SHA-256 | `manifest.json` に記録したハッシュと、回路成果物および manifest 自身のバイト列が一致するか |
| ML-DSA-87 | その成果物ハッシュ一覧のダイジェストが、呼び出し側の渡した公開鍵の署名と一致するか |

SHA-256 の完全性検査と ML-DSA-87 の真正性検査は同じ処理ではありません。SHA-256 は「今あるファイルが、今ある manifest の記録と一致するか」を見ます。ML-DSA-87 は「その記録を、あらかじめ信頼した公開鍵の所持者が署名したか」を見ます。後者は `authenticity` コマンドを実行したときだけ行われ、`verify` の成否には入りません。

manifest と対象ファイルをまとめて差し替えられる状況では、SHA-256 だけでは外部の信頼の根になりません。この制限は Known limitations に書いています。

## 6. Why Poseidon and SHA-256 are separate

回路の中のハッシュは Poseidon です。成果物の完全性に使うハッシュは SHA-256 です。

Poseidon は circomlib が BN254 上の回路向けに提供しているハッシュです。このステートメントは現在の manifest で **415 制約**です。SHA-256 を R1CS に入れると制約数が大きくなり、このリポジトリが採っている小さな回路から外れます。回路コメントでも、SHA-256 は完全性レイヤ側で使う、としています。

したがって、証明が言っている「commitment は secret のハッシュである」は SHA-256 の意味ではありません。Poseidon commitment です。

## 7. Technical overview

現在の `package.json`、`artifacts/manifest.json`、回路から読める値です。

| 項目 | 値 |
| --- | --- |
| Proof system | Groth16 |
| Curve | BN254。snarkjs の証明オブジェクトと verification key では曲線名が `bn128`。mini の manifest と証明封筒では `bn254` |
| Circuit framework | circom。pragma は `2.2.2`。このスナップショットのコンパイラ記録は circom `2.2.3` |
| snarkjs | `0.7.6` |
| circomlib | `2.0.5`（`Poseidon(1)`） |
| circomlibjs | `0.1.7`（回路外で同じ Poseidon を計算） |
| Node.js | `package.json` の `engines` は `>=20`。CI は Node.js 22。この成果物スナップショットの manifest には生成時の Node.js `v24.18.0` が記録されている |
| Public inputs | 1（`commitment`） |
| Private inputs | 1（`secret`） |
| Constraints | 415 |
| Powers of tau | 9。貢献者 1。`ceremony.production` は `false` |
| Authenticity | ML-DSA-87（`@noble/post-quantum` `0.7.1`）。任意 |
| Public signal schema | `aegisproof-mini-public-signals-v1` |
| License | `package.json` は `GPL-3.0-or-later`。`LICENSE` は GNU GPL version 3 |

`bn128` と BN254 は、この実装では同じ曲線を指す二つの名前です。snarkjs がファイルへ書く名前が `bn128` で、mini が自分の manifest と証明封筒に書く名前が `bn254` です。

## 8. Repository structure

主要なファイルだけを示します。

```text
src/prover/prove.js           Groth16 証明の生成
src/verifier/verify.js        Groth16 証明の検証
src/integrity/                SHA-256 manifest の作成と照合
src/authenticity/mldsa.js     ML-DSA-87
src/cli/index.js              コマンドライン
src/index.js                  上記のプロセス内 API

circuit/main.circom           回路
circuit/main.r1cs             制約
circuit/main.wasm             witness 計算
circuit/mini.zkey             開発用 proving key

keys/verification_key.json    Groth16 検証鍵
artifacts/manifest.json       成果物ハッシュ
artifacts/manifest.sha256     manifest.json 自身の SHA-256

scripts/build.js              コンパイルと開発用セレモニー
tests/                        正常系、異常系、改ざん、ML-DSA
fixtures/                     公開スキーマの例。秘密は置いていない
experimental/sepolia/         Sepolia 上で同じ Groth16 検証を実行する拡張
.github/workflows/ci.yml      CI
```

## 9. Quick Start

クローンしたスナップショットを検査する最短経路です。コミット済みの wasm、r1cs、zkey、verification key、manifest を使います。

```bash
npm ci
npm test
npm run integrity
```

開発用セレモニーをやり直す場合は `npm run build` です。circom `2.2.3` が PATH に無いとき、ビルドは `tools/circom-2.2.3-sha256.json` の公式バイナリを取得して SHA-256 を確認します。ビルドは新しい zkey と verification key と manifest を書くので、下のスナップショットハッシュは変わります。

証明と検証のコマンドは次です。秘密の具体値はここに書きません。`commit` は公開 commitment だけを標準出力へ出します。`--secret` はプロセス一覧から見えることがある、と CLI が警告します。入力 JSON はコミットしないでください。

```bash
node src/cli/index.js commit --secret <decimal>
node src/cli/index.js prove --input input.json --output proof.json
node src/cli/index.js verify --proof proof.json
node src/cli/index.js integrity
```

`input.json` の形は次です。`secret` と `commitment` は 10 進文字列です。

```json
{
  "secret": "<decimal field element>",
  "commitment": "<Poseidon(secret) as a decimal string>"
}
```

`package.json` の `scripts` は `npm test`、`npm run integrity`、`npm run prove`、`npm run verify`、`npm run build` です。分割したテストは `test:positive`、`test:negative`、`test:tamper`、`test:authenticity` です。

## 10. Integrity verification

`artifacts/manifest.json` は四つの成果物の SHA-256 を持ちます。

```text
circuit.wasm
circuit.r1cs
circuit.zkey
verification_key.json
```

実ファイルは `circuit/main.wasm`、`circuit/main.r1cs`、`circuit/mini.zkey`、`keys/verification_key.json` です。

`artifacts/manifest.sha256` は `manifest.json` のバイト列の SHA-256 です。小文字 64 桁の 16 進数で、照合時に前後の空白は除きます。

`checkIntegrity` は次の順で失敗させます。

1. `manifest.sha256` が `manifest.json` のバイト列と一致しない
2. manifest の version、Groth16 / BN254、`ceremony.production: false`、成果物名の集合が実装と違う
3. 各ファイルの SHA-256 が manifest の記録と違う

`prove` と `verify` と `integrity` と `sign` はこの検査を通りません。不一致のときは処理を止めます。検査を外すフラグはありません。CLI の完全性失敗は終了コード 2 です。

この検査は、手元のファイルと手元の manifest の自己一致です。署名の検査ではありません。

## 11. ML-DSA-87 authenticity

ML-DSA-87 は任意の真正性レイヤです。Groth16 の `verify` の一部ではありません。`verify` が成功しても、ML-DSA 署名が付いていることにはなりません。

署名対象は、成果物ハッシュをキー名でソートした JSON の UTF-8 に対する SHA-256 ダイジェストです。署名コンテキストは `aegisproof-mini/manifest-authenticity/v1` です。実装は `@noble/post-quantum` の `ml_dsa87` を呼びます。

```bash
node src/cli/index.js sign \
  --public-key-out keys/mldsa_public.json \
  --signature-out artifacts/manifest.sig \
  --secret-key-out dev-mldsa.sk

node src/cli/index.js authenticity \
  --public-key keys/mldsa_public.json \
  --signature artifacts/manifest.sig
```

`sign` は先に完全性検査をします。秘密鍵を書くのは `--secret-key-out` を付けたときだけで、鍵そのものは標準出力へ出しません。このリポジトリは信頼する ML-DSA 公開鍵を同梱していません。公開鍵をどう配り、どれを信頼するかは、このツールの外で決める前提です。

## 12. Security assumptions

コードと manifest から確認できる前提です。

- セレモニーは開発用の単一貢献者です。manifest の `contributors` は 1、`production` は `false` です。`checkIntegrity` は `production` が `false` でない manifest を拒否します。
- 本番のマルチパーティセレモニーではありません。manifest の note も、v2 の `production.zkey` ではないと書いています。
- ビルドは貢献用の公開ラベルに OS の CSPRNG を混ぜます。トラップドアを成果物ファイルへ保存する処理はありません。manifest の `toxicWastePersisted` は `false` です。プロセス実行中のメモリまで消えることは、このリポジトリは証明していません。
- Groth16 の検証は、その verification key の下での検査です。鍵の生成過程を本番水準で信頼できるとはみなせません。
- 依存パッケージの固定は `package-lock.json` です。manifest の対象に `node_modules` は入っていません。
- ML-DSA の公開鍵は呼び出し側が渡します。このリポジトリに PKI はありません。
- `commit --secret` は、秘密がプロセス一覧から見えることがあると標準エラーへ警告します。
- 証明生成は witness ファイルを書きません。秘密は `proof.json` のフィールドにしません。

## 13. Known limitations

- 信頼設定は single-contributor の development ceremony です。
- SHA-256 層は、manifest とファイルをまとめて置き換える攻撃者に対して、外部の真正性を作りません。
- ML-DSA-87 の検証は任意です。`verify` は署名を見ません。
- TEE も ClaimsGate も、このリポジトリにはありません。
- AegisProof v2 の 30 フィールド publicSignals はありません。その形の入力は mini が拒否します。
- STARK や、耐量子証明方式への移行実装はありません。ML-DSA-87 は成果物ダイジェストへの署名であり、証明方式の置換ではありません。
- 回路内ハッシュは Poseidon、成果物ハッシュは SHA-256 です。同じ「ハッシュ」ではありません。
- production のセキュリティシステムとして設計されたものではありません。`package.json` の説明も experimental であり、AegisProof v2 ではないと書いています。
- Sepolia 連携は、同じ開発用 verification key で Groth16 を Ethereum 上で実行する拡張です。手順は「Sepolia Integration」にあります。

## 14. AegisProof v2 との関係

このリポジトリが自分と v2 を区別している範囲です。v2 のソースはこのツリーに無いので、v2 の実装詳細はここから確認できません。

| | AegisProof v2 | AegisProof-mini |
| --- | --- | --- |
| 位置づけ | このリポジトリが replacement ではないと述べている production 系統 | experimental / development reference |
| Frozen Core | このリポジトリはそれを変更しない | 独自の回路、wasm、zkey、verification key |
| 公開信号 | このリポジトリの fixture が「v2 は 30 個」と記録し、mini は拒否する | `commitment` の 1 個 |
| 証明 | このリポジトリは v2 の成果物を使わない | Groth16 / BN254。開発用セレモニー |
| TEE / ClaimsGate | このリポジトリには無い | 無い |
| STARK / 耐量子証明への移行 | このリポジトリには無い | 無い。ML-DSA-87 は任意の成果物署名 |

```text
AegisProof
    ├── v2     production。Frozen Core。このリポジトリは触らない
    └── mini   このリポジトリ。最小の証明、検証、成果物完全性
```

## 15. Reproducibility

このスナップショットの価値は、小さな回路で、証明生成、検証、成果物の完全性検査、改ざん時の失敗を同じツリーの中で再現できることです。

`npm ci` のあと `npm test` と `npm run integrity` は、コミットされている成果物と manifest を検査します。`npm run build` は別の開発用セレモニーを行うため、zkey、verification key、manifest のハッシュは変わります。wasm と r1cs は、同じ circom `2.2.3` とこの `circuit/main.circom` に対するコンパイル結果です。

以下は、この作業ツリーのファイルから計算した SHA-256 です。`artifacts/manifest.json` および `artifacts/manifest.sha256` と一致しています。

```text
circuit.wasm              16fdc8b9caed938299b530a6ebc9885dfdf49abe3c2d73d5cbb9ed1531fb79ea
circuit.r1cs              29027acc31b3440d5a8b42df2be4e7db2ef86b543b69823b2bd5c9b896d1516e
circuit.zkey              5b6a568c2ff858df76d6b09c4dd3eb8779a2ebf121f02d42ffc400ed9e207ac9
verification_key.json     cad6c28700b34d60159ee1ab40c91878d0436aa677d6a97741dacea5803b0485
manifest.json             088729dabde9b9d4dc0182bc7099835b5603d13802626d167a7df6ce2f5c1942
```

CI（`.github/workflows/ci.yml`）は Node.js 22 で `npm ci`、`npm run build`、正常系、異常系、改ざん検知、ML-DSA、`npm run integrity` を実行します。CI はビルドし直すので、上の zkey ハッシュと CI 上のハッシュが一致することは成功条件ではありません。その実行の中で manifest とファイルが一致し、テストが通ることが成功条件です。

## 16. License

`package.json` の `license` は `GPL-3.0-or-later` です。リポジトリの `LICENSE` は GNU General Public License version 3 のテキストです。

依存パッケージの `package.json` が宣言している license は、snarkjs `GPL-3.0`、circomlib `GPL-3.0`、circomlibjs `GPL-3.0`、`@noble/post-quantum` `MIT` です。それ以上の法的な結論は、この README では足していません。

# Sepolia Integration

AegisProof-mini の既存回路で作った Groth16 証明を、Ethereum Sepolia 上の verifier で検証する拡張です。回路、`src/prover`、`src/verifier`、`src/integrity`、`src/authenticity`、既存の zkey と verification key はそのままです。

ローカルの成果物検査と、チェーン上の証明検証は別の仕事です。

| 層 | 見ているもの |
| --- | --- |
| SHA-256 | 成果物の完全性。manifest と wasm、r1cs、zkey、verification key の一致 |
| ML-DSA-87 | 成果物ダイジェストの真正性。任意であり、`verify` は署名を見ない |
| Groth16 | `commitment === Poseidon(secret)` の数学的な証明検証 |
| Sepolia | その Groth16 検証を Ethereum（chain ID 11155111）で実行する場所 |

Sepolia のコントラクトは SHA-256 も ML-DSA-87 も実行しません。オンチェーンで true になったことは、この verification key の下で証明が受け入れられたことであり、成果物ファイルの完全性や真正性がチェーン上で確認されたことにはなりません。

## Architecture

```text
AegisProof-mini
│
│ generate proof
▼
proof.json
│
▼
Sepolia RPC
│
▼
Groth16Verifier
│
▼
verifyProof()
│
▼
true / false
```

`experimental/sepolia/scripts/export-verifier.js` は、`circuit/mini.zkey` から書き出した検証鍵が `keys/verification_key.json` と一致することを確認したあと、snarkjs の Groth16 Solidity テンプレートにその検証鍵を渡して `experimental/sepolia/contracts/Groth16Verifier.sol` を生成します。public input は 1 個なので、生成された `verifyProof` の公開信号は `uint[1]` です。検証は Ethereum の BN254 プリコンパイル（アドレス 6、7、8）を使うテンプレートの形です。

`AegisProofMiniSepolia` はその verifier を継承し、`publicSignalCount()` が 1 を返します。証明の座標は、手で並べ替えず、snarkjs の `groth16.exportSolidityCallData` の出力を使います。

`verifyProof` は view です。読み取りだけでよいときは、この関数の `eth_call` で足ります。生成された verifier は assembly の `return` で呼び出し全体を終えるため、同じ呼び出しの続きで結果を保存できません。`verifyAndRecord` は `staticcall` で `verifyProof` を実行し、返った bool と commitment を状態と `VerificationRecorded` イベントへ残します。今回の記録用トランザクションはこれ 1 件です。

## Requirements

- Node.js 20 以上。この作業では Node.js 24 で実行しました。
- `npm ci` または `npm install`。Sepolia 用の devDependency は `hardhat` 2.29、`@nomicfoundation/hardhat-ethers` 3.1、`ethers` 6.15 です。
- 既存の `circuit/mini.zkey` と `keys/verification_key.json`。セレモニーをやり直す必要はありません。
- Sepolia ETH を持つ秘密鍵。秘密鍵は `SEPOLIA_PRIVATE_KEY` からのみ読みます。

## Environment variables

名前だけを `.env.example` に置いています。値はリポジトリに書きません。`.env` は `.gitignore` の対象です。

```text
SEPOLIA_RPC_URL=
SEPOLIA_PRIVATE_KEY=
SEPOLIA_VERIFIER_ADDRESS=
```

`SEPOLIA_RPC_URL` はデプロイと RPC 呼び出しが読みます。コード、README、deployment ファイルに RPC URL は書いていません。`SEPOLIA_VERIFIER_ADDRESS` は任意です。今回のアドレスは `experimental/sepolia/deployments/sepolia.json` にあります。

## Wallet funding

デプロイスクリプトは、Hardhat network 名が `sepolia` であること、RPC の chain ID が `11155111` であること、chain ID が `1` でないこと、デプロイ bytecode がコンパイル成果物と一致することを確認してから送ります。秘密鍵の値はログに出しません。

残高が見積もりガス代より少ない場合、スクリプトはトランザクションを送らずに停止し、公開アドレスと不足額だけを出します。そのときは Ethereum の公式 faucet で Sepolia ETH を受け取ってください。

- https://www.alchemy.com/faucets/ethereum-sepolia
- https://www.infura.io/faucet/sepolia
- https://cloud.google.com/application/web3/faucet/ethereum/sepolia

mainnet の ETH は使いません。

## Deployment

```text
npm run sepolia:export-verifier
npm run sepolia:test
npm run sepolia:deploy
```

今回のデプロイ結果です。

| 項目 | 値 |
| --- | --- |
| Network | Ethereum Sepolia |
| Chain ID | 11155111 |
| Contract | `0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790` |
| Deployer | `0x23E7347D826Fe25dd709C52FB0036E793D54B8C0` |
| Deploy transaction | `0x48d7fc208986bcec01b28ca0806613969600584196c74b773440439d80f1bd4c` |
| Block | 11866912 |
| Status | 1 |
| Gas used | 3513523 |

- Contract: https://sepolia.etherscan.io/address/0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790
- Deploy transaction: https://sepolia.etherscan.io/tx/0x48d7fc208986bcec01b28ca0806613969600584196c74b773440439d80f1bd4c

## Proof verification

```text
npm run sepolia:verify
```

このコマンドは既存の `prove` / `verify` で証明を作り、同じ公開入力でデプロイ済みコントラクトの `verifyProof` を view call します。今回の結果は `verifyProof true`、改ざんした commitment では `false` でした。使った公開証明は `experimental/sepolia/deployments/public-proof.json` にあります。秘密の witness はそこへ書きません。

`npm run sepolia:test` は、ローカルにデプロイした同じ bytecode と Sepolia 上のコントラクトが、正しい証明、改ざんした proof、改ざんした commitment、別の publicSignals に対して同じ bool を返すことも確認します。deployment ファイルが無いときは、Sepolia 側の比較は pending になり、ローカルの正例と反例だけが実行されます。

## Transaction example

結果をブロックに残すときは 1 件だけ送ります。

```text
npm run sepolia:verify:tx
```

| 項目 | 値 |
| --- | --- |
| Transaction | `0xee001b0be2d475973fc5292e3b2dab5df82d361eefc9875ea906a02eaae4749f` |
| From | `0x23E7347D826Fe25dd709C52FB0036E793D54B8C0` |
| To | `0x6a8Ae56aDd6ba2ea0CDCD9Fe64203C610621b790` |
| Chain ID | 11155111 |
| Block | 11866927 |
| Status | 1 |
| Gas used | 433214 |
| `lastValid` | true |
| `lastCommitment` | `6572332521346552969132897450536910588528541939757210093019227709593248338264` |

https://sepolia.etherscan.io/tx/0xee001b0be2d475973fc5292e3b2dab5df82d361eefc9875ea906a02eaae4749f

## Limitations

- コントラクトに埋め込まれている検証鍵は、このリポジトリの開発用単一貢献者セレモニーの鍵です。オンチェーン検証はその鍵を本番のマルチパーティセレモニーへ引き上げません。
- 公開信号は `commitment` の 1 個だけです。
- チェーンは証明の数学的な検査だけを行います。SHA-256 の完全性検査と ML-DSA-87 の真正性検査は、今までどおりローカルの別レイヤーです。
- `verifyProof` の view call で成否は分かります。`verifyAndRecord` は、その結果をトランザクションとして残すための最小の関数です。
- この節のアドレスとトランザクションは、上記の 1 回のデプロイと 1 回の検証トランザクションの記録です。
