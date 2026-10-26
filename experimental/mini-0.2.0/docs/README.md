# AegisProof-mini

[![CI](https://github.com/zenoamo/AegisProof-mini/actions/workflows/ci.yml/badge.svg)](https://github.com/zenoamo/AegisProof-mini/actions/workflows/ci.yml)
[![CodeQL](https://github.com/zenoamo/AegisProof-mini/actions/workflows/codeql.yml/badge.svg)](https://github.com/zenoamo/AegisProof-mini/actions/workflows/codeql.yml)
[![Crypto security](https://github.com/zenoamo/AegisProof-mini/actions/workflows/crypto-security.yml/badge.svg)](https://github.com/zenoamo/AegisProof-mini/actions/workflows/crypto-security.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)
[![GitHub](https://img.shields.io/badge/github-zenoamo%2FAegisProof--mini-181717.svg)](https://github.com/zenoamo/AegisProof-mini)

AegisProof-mini is an experimental reference implementation for reproducible Groth16 proof generation, verification, artifact integrity, and an Ethereum Sepolia integration layer.

秘密値の Poseidon commitment に対する Groth16 証明を作り、その証明を検証し、回路成果物の SHA-256 が manifest と一致するかを確認する実験用の参照実装です。Ethereum Sepolia への接続は、その Groth16 検証をテストネット上で実行する拡張です。本番システムではなく、AegisProof v2 の代替でもありません。

| | |
| --- | --- |
| 証明すること | 秘密値 `secret` とコンテキスト原像 `context` を知っていて、5 個の公開信号が回路の Poseidon 関係を満たす |
| 暗号方式 | Groth16 / BN254。公開信号は `commitment`、`nullifier`、`contextHash`、`policyId`、`epoch` の 5 個 |
| Security model | Groth16 の証明検証、SHA-256 の成果物完全性、任意の ML-DSA-87 真正性は別の層。開発用の単一貢献者セレモニー |
| Sepolia | chain ID `11155111` 上の experimental integration。Core protocol ではない |
| AegisProof v2 | このリポジトリは v2 の本番 Frozen Core を含まない。v2 の 30 個の無名信号は mini の検証器が拒否する |
| 証明基盤 | このリポジトリの中の FrozenCore。mini 0.2.0 の 5 信号と、実験用 30 信号は別回路・別鍵である |
| 位置づけ | experimental / development reference。production の保証はない。0.2.0、`frozencore/`、`experimental/local-tee/`、5 信号のローカル契約は作業ツリーにあり、コミット `90df4d2` には無い |

文書の入口は [docs/README.md](docs/README.md) です。セキュリティ上の報告は [SECURITY.md](SECURITY.md)、参加方法は [CONTRIBUTING.md](CONTRIBUTING.md) です。

## Quick Start

コミットされている wasm、r1cs、zkey、verification key、manifest を検査する最短経路です。

```bash
npm ci
npm test
npm run integrity
```

Node.js は `package.json` の `engines` により 20 以上です。任意の Sepolia テストは `npm run sepolia:test` です。デプロイには `.env` の `SEPOLIA_RPC_URL` と `SEPOLIA_PRIVATE_KEY` が必要で、秘密はリポジトリに置きません。手順の詳細は [docs/SEPOLIA.md](docs/SEPOLIA.md) と、この README の「Sepolia Integration」です。

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

このリポジトリは AegisProof v2 の本番 Frozen Core を含まず、それを変更しません。`production.zkey`、v2 の WASM、v2 の R1CS は使いません。v2 を名乗る 30 個の無名公開信号は、mini の検証器が拒否します。

このリポジトリ内の FrozenCore は、別プロジェクトではなく、証明対象と回路と鍵を世代ごとに持つ基盤の名前です。作業ツリーで検証できるのは mini 0.2.0 の 5 信号と、`frozencore/circuit/statement.circom` の実験用 30 信号です。30 信号版は唯一の正式仕様ではありません。同じ秘密の commitment は、mini では `Poseidon(secret)`、30 信号版では `Poseidon(16, secret)` であり、証明は交換できません。入口は `src/foundation.js` の `verifyStatement` です。

## 3. What does it prove?

プロトコルバージョンは `aegisproof-mini-0.2.0`、証明封筒のスキーマは `aegisproof-mini-public-signals-v2` です。`0.1.0` の封筒（公開信号 1 個、スキーマ `aegisproof-mini-public-signals-v1`）は検証器が拒否します。

公開信号の順序は固定です。型はすべて BN254 スカラー体の正規 10 進文字列です。先頭ゼロは拒否します。

| Index | 名前 | 誰が計算するか |
| --- | --- | --- |
| 0 | `commitment` | `Poseidon(secret)`。0.1.0 のコミットメント関数と同じ |
| 1 | `nullifier` | `Poseidon(3, secret, contextHash, policyId, epoch)` |
| 2 | `contextHash` | `Poseidon(2, context)` |
| 3 | `policyId` | 呼び出し側が選ぶ識別子。回路はこれを nullifier に束縛する |
| 4 | `epoch` | 呼び出し側が選ぶ世代。回路はこれを nullifier に束縛する |

ドメイン定数 `2` と `3` は `src/statement.js` と `circuit/main.circom` で同じ値です。秘密ではありません。

```text
private: secret, context
public:  commitment, nullifier, contextHash, policyId, epoch
```

`commitment` の関数は 0.1.0 と同じ `Poseidon(secret)` です。証明文は 0.1.0 と互換ではありません。同じ secret でも、context、policyId、epoch が違えば nullifier は別の値になります。全用途で一つの nullifier にすると、同じ secret の証明が nullifier で結び付きます。このプロトコルは、その結び付きを避けるため、再利用範囲を `(secret, contextHash, policyId, epoch)` にしました。

コンテキストの元データがバイト列のときは、`contextFieldFromBytes` が最短のビッグエンディアン符号なし整数にします。長さは 1 から 31 バイトです。空列と、長さ 2 以上の先頭ゼロは拒否します。ゼロは 1 バイトの `0x00` だけです。UTF-8 は BOM 無しの `TextEncoder` です。回路が見るのはその体元素 `context` であり、バイト列そのものではありません。JavaScript の `contextHash` と、回路が公開する `contextHash` が一致することをテストします。

`policyId` はポリシー文書を指す識別子です。回路は「この証明がその識別子に束縛されている」ことまでを制約します。ポリシー条件を満たすことは証明しません。条件そのものがこのリポジトリには定義されていないためです。

`epoch` は世代の識別子です。回路は証明をその値に束縛します。現在の epoch は決めません。ローカル実験コントラクトでは、所有者が `setEpoch` した値だけを受理します。それ以外の epoch の証明は、証明が数学的に正しくてもコントラクトが拒否します。

回路が保証すること:

- `commitment`、`contextHash`、`nullifier` が上の Poseidon 式と一致する
- 公開信号を入れ替えると、その証明は検証に失敗する

回路が保証しないこと:

- ポリシー条件への適合
- epoch が現在時刻や許可された世代であること
- nullifier が未使用であること

未使用の確認は検証者の状態です。ローカルコントラクト `AegisProofMiniStatement` は、使用済み nullifier を記録し、再利用を revert します。無効な証明では記録しません。デプロイ済みの `AegisProofMiniSepolia` は 0.1.0 の 1 信号のままです。この作業ではそのコントラクトを再デプロイしていません。

検証鍵は `npm run build` の開発用単一貢献者セレモニーで作り直しています。`ceremony.production` は `false` です。トラップドアを捨てたことは検証していません。以前の verification key を信頼していた場合、この鍵は別のセットアップです。

`secret` と `context` は証明封筒へ書きません。

## 4. Architecture

証明の流れと、成果物の流れは別です。

```text
secret
  ↓
Poseidon(secret)
  ↓
commitment, nullifier, contextHash, policyId, epoch
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

Poseidon は circomlib が BN254 上の回路向けに提供しているハッシュです。このステートメントは現在の manifest で **1767 制約**です。SHA-256 を R1CS に入れると制約数が大きくなり、このリポジトリが採っている小さな回路から外れます。完全性検査の SHA-256 は回路の外です。

したがって、証明が言っている「commitment は secret のハッシュである」は SHA-256 の意味ではありません。Poseidon commitment です。

## 7. Technical overview

現在の `package.json`、`artifacts/manifest.json`、回路から読める値です。

| 項目 | 値 |
| --- | --- |
| Proof system | Groth16 |
| Curve | BN254。snarkjs の証明オブジェクトと verification key では曲線名が `bn128`。mini の manifest と証明封筒では `bn254` |
| Circuit framework | circom。pragma は `2.2.2`。このスナップショットのコンパイラ記録は circom `2.2.3` |
| snarkjs | `0.7.6` |
| circomlib | `2.0.5`（`Poseidon(1)`、`Poseidon(2)`、`Poseidon(5)`） |
| circomlibjs | `0.1.7`（回路外で同じ Poseidon を計算） |
| Node.js | `package.json` の `engines` は `>=20`。CI は Node.js 22。この成果物スナップショットの manifest には生成時の Node.js `v24.18.0` が記録されている |
| Public inputs | 5（`commitment`、`nullifier`、`contextHash`、`policyId`、`epoch`） |
| Private inputs | 2（`secret`、`context`） |
| Constraints | 1767 |
| Powers of tau | 11。貢献者 1。`ceremony.production` は `false` |
| Authenticity | ML-DSA-87（`@noble/post-quantum` `0.7.1`）。任意 |
| Public signal schema | `aegisproof-mini-public-signals-v2` |
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
artifacts/manifest.json       成果物ハッシュ、パス、サイズ、binding
artifacts/manifest.sha256     manifest.json 自身の SHA-256
artifacts/baseline.json       コミットされたスナップショットのアンカー。build は更新しない

scripts/build.js              コンパイルと開発用セレモニー
scripts/security-observability.js  秘密の実値、弱い暗号 API、audit の分類。鍵検査は既存 CLI
scripts/release.ps1           ローカル専用の release gate。GitHub Actions からは呼ばない
tests/                        正常系、異常系、改ざん、ML-DSA
fixtures/                     公開スキーマの例。秘密は置いていない
experimental/sepolia/         Sepolia 上で同じ Groth16 検証を実行する拡張
docs/                         アーキテクチャ、脅威モデル、再現性、Sepolia
.github/workflows/ci.yml      ビルドを含む CI
.github/workflows/codeql.yml  CodeQL。暗号健全性の検査ではない
.github/workflows/crypto-security.yml  コミット済み成果物の鍵、改ざん、ML-DSA、Sepolia ローカルテスト
```

## 9. Quick Start

クローンしたスナップショットを検査する最短経路です。コミット済みの wasm、r1cs、zkey、verification key、manifest を使います。

```bash
npm ci
npm test
npm run integrity
```

開発用セレモニーをやり直す場合は `npm run build` です。circom `2.2.3` が PATH に無いとき、ビルドは `tools/circom-2.2.3-sha256.json` の公式バイナリを取得して SHA-256 を確認します。ビルドは新しい zkey と verification key と manifest を書くので、下のスナップショットハッシュは変わります。`artifacts/baseline.json` はビルドでは更新しません。

証明と検証のコマンドは次です。秘密の具体値はここに書きません。`commit` は公開 commitment だけを標準出力へ出します。`--secret` はプロセス一覧から見えることがある、と CLI が警告します。入力 JSON はコミットしないでください。

```bash
node src/cli/index.js commit --secret <decimal>
node src/cli/index.js prove --input input.json --output proof.json
node src/cli/index.js verify --proof proof.json
node src/cli/index.js integrity
```

`input.json` の形は次です。値は正規化された 10 進文字列です。`commitment`、`nullifier`、`contextHash` は省くと実装が計算します。渡した場合は、計算結果と一致しないと回路が拒否します。

```json
{
  "secret": "<decimal field element>",
  "context": "<decimal field element>",
  "policyId": "<decimal field element>",
  "epoch": "<decimal field element>"
}
```

`package.json` の `scripts` は `npm test`、`npm run integrity`、`npm run keys:check`、`npm run key-info`、`npm run prove`、`npm run verify`、`npm run build` です。分割したテストは `test:positive`、`test:negative`、`test:tamper`、`test:authenticity` です。Sepolia 用は `sepolia:export-verifier`、`sepolia:test`、`sepolia:deploy`、`sepolia:verify`、`sepolia:verify:tx` です。

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
4. `files` があるとき、記録された path、SHA-256、バイト数がファイルと違う

`prove` と `verify` と `integrity` と `sign` はこの検査を通りません。不一致のときは処理を止めます。検査を外すフラグはありません。CLI の完全性失敗は終了コード 2 です。

`npm run keys:check` は、この自己一致に加え、`snarkjs.r1cs.info` と `snarkjs.zKey.exportVerificationKey` で r1cs と zkey と verification key の対応を見ます。さらに `artifacts/baseline.json` とも比べます。`npm run key-info` は、baseline との比較を除いた公開フィンガープリントを出します。秘密は出しません。詳細は [docs/KEY_MANAGEMENT.md](docs/KEY_MANAGEMENT.md) です。

この検査は、手元のファイルと手元の manifest の自己一致です。署名の検査ではありません。powers-of-tau に対する `zkey verify` は、ビルド中にそのファイルがあるときだけ実行できます。

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

- AegisProof-mini currently uses a single-contributor development ceremony. manifest の `contributors` は 1、`production` は `false` です。`checkIntegrity` は `production` が `false` でない manifest を拒否します。
- production-grade のマルチパーティセレモニーではありません。toxic waste の破棄を独立に検証する記録はありません。SHA-256 と ML-DSA-87 は、この setup assumption を消しません。trustless setup ではありません。
- ビルドは貢献用の公開ラベルに OS の CSPRNG を混ぜます。トラップドアを成果物ファイルへ保存する処理はありません。manifest の `toxicWastePersisted` は `false` です。プロセス実行中のメモリまで消えることは、このリポジトリは証明していません。
- Groth16 の検証は、その verification key の下での検査です。鍵の生成過程を本番水準で信頼できるとはみなせません。検証の数学と、セレモニーへの信頼は別です。
- 依存パッケージの固定は `package-lock.json` です。manifest の対象に `node_modules` は入っていません。
- ML-DSA の公開鍵は呼び出し側が渡します。このリポジトリに PKI はありません。
- `commit --secret` は、秘密がプロセス一覧から見えることがあると標準エラーへ警告します。
- 証明生成は witness ファイルを書きません。秘密は `proof.json` のフィールドにしません。

## 13. Known limitations

- AegisProof-mini currently uses a single-contributor development ceremony. production-grade MPC ceremony ではなく、toxic waste の破棄は独立に検証できません。SHA-256 と ML-DSA-87 はこの setup assumption を消しません。
- SHA-256 層は、manifest とファイルをまとめて置き換える攻撃者に対して、外部の真正性を作りません。
- ML-DSA-87 の検証は任意です。`verify` は署名を見ません。
- ハードウェア TEE もリモートアテステーションも、このリポジトリにはありません。`experimental/local-tee/` は通常の Node.js プロセスで、`hardwareIsolation` と `remoteAttestation` は false です。
- mini の検証器は、自分の 5 信号以外を拒否します。30 個の無名信号も、FrozenCore 実験回路の封筒も、mini の鍵では通りません。
- 実験用 30 信号回路は `frozencore/` にあり、別の開発用セレモニーです。期限、失効根、承認コミットメント、ZKVM コミットメント、アテステーションコミットメントは、それぞれの外部検証を行いません。詳細は [frozencore/SPEC.md](frozencore/SPEC.md) です。
- STARK や、耐量子証明方式への移行実装はありません。ML-DSA-87 は成果物ダイジェストへの署名であり、証明方式の置換ではありません。
- 回路内ハッシュは Poseidon、成果物ハッシュは SHA-256 です。同じ「ハッシュ」ではありません。
- production のセキュリティシステムとして設計されたものではありません。`package.json` の説明も experimental であり、AegisProof v2 ではないと書いています。
- デプロイ記録の Sepolia 契約は、公開信号 1 個の検証器です。作業ツリーの 5 信号鍵とは別物です。5 信号の `AegisProofMiniStatement` はローカル実験であり、この記録のアドレスへはデプロイしていません。手順は「Sepolia Integration」にあります。

## 14. 証明基盤と AegisProof v2

FrozenCore はこのリポジトリの中の証明基盤です。公開信号の個数そのものではなく、回路と鍵とスキーマの組を指します。AegisProof v2 の本番 Frozen Core は、このツリーにありません。

| 世代 | スキーマ | 公開信号 | 作業ツリーで検証できるか | 鍵 |
| --- | --- | --- | --- | --- |
| mini 0.1.0 | `aegisproof-mini-public-signals-v1` | `commitment` の 1 個。`Poseidon(secret)` | 作業ツリーでは拒否する。専用鍵の復元は未決定。Sepolia の記録は 1 信号のまま | 作業ツリーには無い。コミット `90df4d2` の verification key は `nPublic` 1 |
| mini 0.2.0 | `aegisproof-mini-public-signals-v2` | 5 個。nullifier は `Poseidon(3, secret, contextHash, policyId, epoch)` | できる | `circuit/mini.zkey` と `keys/verification_key.json` |
| 実験 30 信号 | `frozencore-public-signals-v1` | 30 個。commitment は `Poseidon(16, secret)`。nullifier は policyVersion、executionId、domainSeparator を含む | `verifyStatement` でできる。唯一の正式仕様ではない。未コミット | 実行鍵は `frozencore/dev/statement/`。`frozencore/artifacts/` と `frozencore/keys/` はレガシーで、実行経路は使わない |
| guest | `frozencore-guest-journal-v1` | 4 個。`zkvmProgramId`、`inputRoot`、`outputCommitment`、`executionId` | `verifyStatement` は選ばない。専用の guest 検証器と開発用鍵はある。未コミット | `frozencore/dev/guest/`。statement の鍵ではない |

`src/foundation.js` は封筒のスキーマで検証器を選びます。5 信号の証明を 30 信号の鍵で検証すること、およびその逆は、成功になりません。値を並べ替えたり数を合わせたりしても、証明対象が同じになるわけではありません。

両方のセレモニーは単一貢献者の開発用です。複数人の本番セレモニーではなく、毒性パラメータの破棄は確認できません。レガシーの statement ptau は `frozencore/setup/statement/pot_final.ptau`、実行中の開発用 ptau は `frozencore/dev/statement/pot_final.ptau` と `frozencore/dev/guest/pot_final.ptau` です。バイト列は互いに違います。mini 0.2.0 の ptau は残っていません。

```text
AegisProof-mini
    ├── FrozenCore（このリポジトリの証明基盤）
    │     ├── mini 0.2.0          circuit/main.circom      5 signals
    │     ├── statement 0.1.0     frozencore/circuit/statement.circom   30 signals
    │     └── guest               frozencore/circuit/guest.circom       4 signals, dev key, not routed by verifyStatement
    └── AegisProof v2 の本番 Frozen Core は、このツリーに無い
```

v2 のソースはこのツリーに無いので、v2 の 30 フィールドの意味はここから確認できません。`fixtures/invalid/v2-public-signals.json` は 30 個の `"0"` であり、実験 30 信号スキーマではありません。

## 15. Reproducibility

このスナップショットの価値は、小さな回路で、証明生成、検証、成果物の完全性検査、改ざん時の失敗を同じツリーの中で再現できることです。

`npm ci` のあと `npm run keys:check` は、コミットされている成果物と manifest と baseline を検査します。`npm test` と `npm run integrity` は、その時点の成果物と manifest の対応を検査します。CI は build の前に `keys:check` を実行し、build のあとの `test:positive` は作り直したセレモニーの内部整合を見ます。`npm run build` は別の開発用セレモニーを行うため、zkey、verification key、manifest のハッシュは変わります。baseline はそのとき更新しません。wasm と r1cs は、同じ circom `2.2.3` とこの `circuit/main.circom` に対するコンパイル結果です。zkey が毎回同じバイト列になることは主張しません。

以下は、2026-10-23 にこの作業ツリーのファイルから計算した SHA-256 です。`artifacts/manifest.json`、`artifacts/manifest.sha256`、`artifacts/baseline.json` と一致しています。コミット `90df4d2` の 1 信号スナップショットとは別の値です。この作業ツリーがコミットされるまで、GitHub 上の CI が見るのは `90df4d2` の成果物です。

```text
circuit.wasm              8997ccc90e7804613499ea89d71ac5d4b5f24ba17ad27131e8bede56112f4b29
circuit.r1cs              7fde21c78b0ad9ea61de29ab4f9d88b992d49762b80e8718c946ccdf8817be70
circuit.zkey              9c7cb878ff4f5ccbedef828d9ae4a10277a816c41b7d54d580652e8c1c07af1e
verification_key.json     b8242de2d49d00093709760c497c241e73429e35ceec4541800435ef7778e21f
manifest.json             94daf00e3ae4363449ca6b105b427f262aaef74120967339e431e7ae2b4f89bf
```

CI（`.github/workflows/ci.yml`）は Node.js 22 で `npm ci`、チェックアウトしたツリーに対する `npm run keys:check`、その鍵のままの `npm run sepolia:test`、そのあとの `npm run build`、正常系、異常系、改ざん検知、ML-DSA、`npm run integrity`、世代分離、local-tee、frozencore を実行します。`keys:check` はビルド前なので、チェックアウトされた baseline との一致を見ます。ビルド後の integrity は、そのジョブが作り直した成果物の自己一致です。上の zkey ハッシュと、ビルド後の zkey ハッシュが一致することは成功条件ではありません。Sepolia のローカルテストは build より前です。build が verification key を書き換えたあとでは、生成済みの `Groth16VerifierV2.sol` と鍵がずれます。

`.github/workflows/crypto-security.yml` は build しません。チェックアウトした成果物に対して `keys:check`、integrity、正常系、異常系、改ざん、ML-DSA、世代分離、local-tee、frozencore、`npm run sepolia:test`、依存関係 audit を実行します。Sepolia へのデプロイはしません。これらの追加テストは、そのソースがチェックアウトされたコミットに含まれているときにだけ実行できます。`.github/workflows/codeql.yml` は JavaScript / TypeScript と GitHub Actions の一般的な検査です。CodeQL の成功は、Groth16、成果物完全性、ML-DSA-87 の成功を意味しません。層の対応は [SECURITY.md](SECURITY.md) にあります。

ローカルの release gate は `scripts/release.ps1` です。Windows PowerShell 5.1 と PowerShell 7 から、リポジトリ直下で次を実行します。

```powershell
.\scripts\release.ps1 -DryRun
.\scripts\release.ps1
```

`-DryRun` は `keys:check`、integrity、テスト、Sepolia のローカルテスト、`git diff --check`、成果物 SHA-256 の前後比較、stage 候補の表示までを行い、commit と push はしません。通常実行は検査のあと、許可したファイルだけを個別に stage し、commit 前と push 前に確認を求めます。`npm run build`、Sepolia へのデプロイ、force push は使いません。GitHub Actions はこの script を呼びません。自動 stage の対象は CodeQL / crypto-security の workflow、`scripts/security-observability.js`、`SECURITY.md`、`README.md`、`docs/` のうち、実際に変わっているファイルです。回路、zkey、verification key、baseline、Sepolia deployment、`package.json`、`package-lock.json` に変更があると中止します。

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

デプロイ済みの `Groth16Verifier.sol` は 0.1.0 の検証鍵を埋め込んだままです。`export-verifier.js` は今の 5 信号の鍵から `Groth16VerifierV2.sol` を書き、デプロイ済みファイルは変更しません。`AegisProofMiniStatement` はその v2 verifier を使い、`uint[5]` の公開信号を受けます。順序は commitment、nullifier、contextHash、policyId、epoch です。ネットワークへの新規デプロイはこの変更では行っていません。

`AegisProofMiniSepolia` はその verifier を継承し、`publicSignalCount()` が 1 を返します。証明の座標は、手で並べ替えず、snarkjs の `groth16.exportSolidityCallData` の出力を使います。

`verifyProof` は view です。読み取りだけでよいときは、この関数の `eth_call` で足ります。生成された verifier は assembly の `return` で呼び出し全体を終えるため、同じ呼び出しの続きで結果を保存できません。`verifyAndRecord` は `staticcall` で `verifyProof` を実行し、返った bool と commitment を状態と `VerificationRecorded` イベントへ残します。今回の記録用トランザクションはこれ 1 件です。

## Requirements

- Node.js 20 以上。この作業では Node.js 24 で実行しました。
- `npm ci` または `npm install`。Sepolia 用の devDependency は `hardhat` 2.29、`@nomicfoundation/hardhat-ethers` 3.1、`ethers` 6.17 です。
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
- デプロイ済みコントラクトの公開信号は、記録当時の `commitment` 1 個のままです。5 信号の検査はローカルの `AegisProofMiniStatement` です。
- チェーンは証明の数学的な検査だけを行います。SHA-256 の完全性検査と ML-DSA-87 の真正性検査は、今までどおりローカルの別レイヤーです。
- `verifyProof` の view call で成否は分かります。`verifyAndRecord` は、その結果をトランザクションとして残すための最小の関数です。
- この節のアドレスとトランザクションは、上記の 1 回のデプロイと 1 回の検証トランザクションの記録です。
