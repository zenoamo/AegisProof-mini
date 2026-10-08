# AegisProof mini

```text
AegisProof mini is NOT AegisProof v2.

AegisProof mini is an experimental / development
reference implementation intended for testing,
education, integration prototyping, and architecture
validation.

It must not be treated as a replacement for the
production AegisProof v2 system.
```

AegisProof mini は、証明生成、検証、成果物の完全性、改ざん検知を最小構成で再現する実験実装です。このリポジトリは AegisProof v2 の Frozen Core を含みません。`production.zkey`、v2 の WASM、v2 の R1CS、30 フィールドの publicSignals は使いません。

設計の優先順位は「小さくするが、安全性の考え方は小さくしない」です。証明、検証、完全性、分離、再現手順、異常系テストを分けて持っています。

## 境界

```text
AegisProof
    │
    ├── AegisProof v2     Production / Frozen Core / 30 publicSignals / ML-DSA-87
    └── AegisProof mini   Experimental / Minimal Core / 1 publicSignal / optional ML-DSA-87
```

mini の成果物名は `circuit/mini.zkey` です。ビルドは `production.zkey` を読み書きしません。

## 1. Requirements

開発機で確認した版:

| 項目 | 版 |
| --- | --- |
| OS | Windows 10/11 x64。CI は `ubuntu-latest` |
| Node.js | 開発機 `v24.18.0`。CI は Node.js 22。`engines` は `>=20` |
| npm | 11.16.0（ロックファイルは npm 11 の lockfileVersion 3） |
| circom | 2.2.3 |
| snarkjs | 0.7.6 |
| circomlib | 2.0.5 |
| circomlibjs | 0.1.7 |
| @noble/post-quantum | 0.7.1（ML-DSA-87） |

circom 2.2.3 が PATH に無い場合、`npm run build` は [iden3/circom v2.2.3](https://github.com/iden3/circom/releases/tag/v2.2.3) の公式バイナリを SHA-256 検証して `tools/bin/` に置きます。固定値は `tools/circom-2.2.3-sha256.json` です。

## 2. Installation

```bash
npm ci
```

依存関係を変えない再インストールでは `npm ci` を使います。`package-lock.json` が版の固定源です。

## 3. Circuit compilation

回路は `circuit/main.circom` です。

```text
private input: secret
public input:  commitment
constraint:    commitment === Poseidon(secret)
publicSignals: [commitment]
```

コンパイルと鍵生成は次のコマンドに含まれます。

```bash
npm run build
```

circom の include パスは `node_modules/circomlib/circuits` です。生成される回路ファイルは `circuit/main.r1cs` と `circuit/main.wasm` です。このスナップショットの制約数は **415**、秘密入力 1、公開入力 1 です。

### ハッシュの選択

回路内ハッシュは Poseidon(1) です。circomlib の Poseidon は BN254 上の ZK 向けハッシュで、このステートメントは 415 制約に収まります。SHA-256 を R1CS に入れると制約が数万規模になり、mini の「小さい回路」という目的から外れます。

成果物の完全性は回路とは別に SHA-256 です。SHA-256 の衝突耐性を、証明したいステートメントのハッシュと混ぜていません。

ASSUMPTION: Poseidon のパラメータは circomlib 2.0.5 の `Poseidon(1)` と、同じ版の circomlibjs に従います。mini は SHA-256 回路を持ちません。

## 4. Trusted setup

`npm run build` は開発専用の単一貢献者 Groth16 セットアップを実行します。

```text
powersoftau new bn128 power=9
powersoftau contribute        名前: aegisproof-mini-dev-phase1
powersoftau prepare phase2
groth16 setup
zkey contribute               名前: aegisproof-mini-dev-phase2
zkey verify
verification key export
```

power は snarkjs と同じ式 `floor(log2(constraints + public + outputs)) + 1` で、この回路では 9 です。snarkjs は BN254 を `bn128` と呼びます。mini の公開メタデータでは曲線名を `bn254` と書きます。

貢献に渡すエントロピー文字列は公開ラベルです。snarkjs はこれに OS の CSPRNG を混ぜ、有害廃棄物（toxic waste）をファイルへ書きません。そのため zkey と verification key のバイト列はビルドごとに変わります。文字列だけではトラップドアを再計算できません。

これはマルチパーティのセレモニーではありません。ビルドを実行したプロセスのメモリ上には、その実行中だけトラップドアが現れます。本番の信頼設定としては扱えません。

## 5. Proof generation

公開コミットメントだけを計算するコマンドです。秘密は標準出力へ戻しません。`--secret` はプロセス一覧から見えることがあるので、実験用です。

```bash
node src/cli/index.js commit --secret 1
```

Poseidon(1) の公開テストベクトル:

```text
18586133768512220936620570745912940619677854269274689475585506675881198879027
```

入力ファイルは秘密とコミットメントを持ちます。このファイルはコミットしないでください。`.gitignore` は `input.json` を除外します。

```json
{
  "secret": "1",
  "commitment": "18586133768512220936620570745912940619677854269274689475585506675881198879027"
}
```

```bash
node src/cli/index.js prove --input input.json --output proof.json
```

`proof.json` に入るのは Groth16 証明と `publicSignals` だけです。秘密は書きません。証明生成と検証は別モジュールです。

```text
src/prover/prove.js      証明生成。検証関数は呼ばない
src/verifier/verify.js   検証。証明生成は呼ばない
src/integrity/check.js   SHA-256。証明も検証もしない
```

証明の前に完全性検証を実行します。不一致のときは証明を作りません。witness 計算中のコンソール出力は捨て、失敗時のメッセージにも秘密やフィールド要素を含めません。

## 6. Verification

```bash
node src/cli/index.js verify --proof proof.json
```

検証経路は次のとおりです。

```text
proof.json
  → schema（publicSignals は 1 個、曲線は bn254）
  → manifest と成果物の SHA-256
  → keys/verification_key.json
  → snarkjs.groth16.verify
  → true / false
```

成功時の終了コードは 0、検証拒否は 1、完全性の失敗は 2、証明生成の失敗は 3、使い方の失敗は 4、ML-DSA の失敗は 5 です。

30 個の publicSignals は mini のスキーマではないので拒否します。v2 の検証鍵へ差し替えることも、完全性検証が先に失敗します。

## 7. Integrity verification

```bash
node src/cli/index.js integrity
```

`artifacts/manifest.json` の各 SHA-256 と、`artifacts/manifest.sha256`（manifest ファイル自身の SHA-256）を実ファイルと比較します。無効化するフラグはありません。

対象:

```text
circuit/main.wasm
circuit/main.r1cs
circuit/mini.zkey
keys/verification_key.json
artifacts/manifest.json
```

### ML-DSA-87（任意の真正性レイヤ）

SHA-256 完全性と ML-DSA 真正性は分離しています。Groth16 の `verify` は ML-DSA を要求しません。署名は成果物ハッシュを正規化した JSON の SHA-256 ダイジェストに対する ML-DSA-87 で、コンテキストは `aegisproof-mini/manifest-authenticity/v1` です。

```bash
node src/cli/index.js sign \
  --public-key-out keys/mldsa_public.json \
  --signature-out artifacts/manifest.sig \
  --secret-key-out dev-mldsa.sk

node src/cli/index.js authenticity \
  --public-key keys/mldsa_public.json \
  --signature artifacts/manifest.sig
```

秘密鍵は `--secret-key-out` を付けたときだけ書き、標準出力には出しません。`*.mldsa.sk` は gitignore 対象です。公開鍵の配布は帯域外です。mini は PKI を持ちません。

ASSUMPTION: ML-DSA-87 のパラメータセットは v2 と同じ FIPS 204 のカテゴリ 5 ですが、鍵、メッセージ、成果物は v2 と無関係です。Phase 1 の検証経路には入れていません。

## 8. Tests

```bash
npm test
npm run test:positive
npm run test:negative
npm run test:tamper
npm run test:authenticity
npm run integrity
```

Node.js 24.18.0 で 18 件が成功しています。snarkjs は検証後もワーカーを残すため、テストランナーは `--test-force-exit` で終了します。CLI と `npm run build` は処理のあと `process.exit` します。

最低限の対応:

| テスト | 期待 |
| --- | --- |
| 正常入力 | 証明生成が成功する |
| 正常証明 | 検証が成功する |
| proof 改ざん | 検証が失敗する |
| public signal 改ざん | 検証が失敗する |
| verification key 改ざん | 暗号検証が失敗する |
| WASM 改ざん | SHA-256 不一致 |
| manifest 改ざん | 完全性検証が失敗する |
| 不正入力 | 証明生成が失敗する |

追加で、v2 形の 30 信号を拒否すること、フィールド外と非 10 進の入力を証明前に拒否すること、WASM を変えて manifest を整合させても元の ML-DSA 署名が拒否されることを確認します。テストは秘密をフィクスチャへ保存しません。

## 9. Artifact hashes

この作業ツリーの参照スナップショットです。`npm run build` は新しい開発用セレモニーを行うため、zkey と verification key と manifest のハッシュは変わります。wasm と r1cs は circom 2.2.3 とこの回路に対して安定する想定です。

```text
circuit.wasm             16fdc8b9caed938299b530a6ebc9885dfdf49abe3c2d73d5cbb9ed1531fb79ea
circuit.r1cs             29027acc31b3440d5a8b42df2be4e7db2ef86b543b69823b2bd5c9b896d1516e
circuit.zkey             5b6a568c2ff858df76d6b09c4dd3eb8779a2ebf121f02d42ffc400ed9e207ac9
verification_key.json    cad6c28700b34d60159ee1ab40c91878d0436aa677d6a97741dacea5803b0485
manifest.sha256          088729dabde9b9d4dc0182bc7099835b5603d13802626d167a7df6ce2f5c1942
```

サイズは wasm 1,633,973 bytes、r1cs 53,212 bytes、zkey 186,592 bytes、verification key 3,158 bytes です。

CI は毎回 `npm run build` してからテストします。CI 上のハッシュがこの表と違うこと自体は失敗条件ではありません。失敗条件は、そのビルドの manifest とファイルが一致し、証明、検証、改ざん検知が通ることです。

## 10. Security limitations

- 単一貢献者の開発用セットアップです。本番の MPC でも、AegisProof v2 の `production.zkey` でもありません。
- トラップドアは成果物へ保存しません。ビルドを実行した環境がそのプロセス中にトラップドアを観測できる可能性は残ります。
- Poseidon は ZK 回路では標準的ですが、SHA-256 より解析の歴史が短いハッシュです。
- `manifest.json` と `manifest.sha256` と対象ファイルをまとめて差し替えると、SHA-256 層は通ります。それを止めるのは、帯域外で信頼した公開鍵による ML-DSA 検証です。`verify` は既定では ML-DSA を見ません。
- 依存パッケージの完全性は `package-lock.json` に依存します。manifest は node_modules をハッシュしません。
- TEE、ClaimsGate、30 フィールドのクレーム、STARK、耐量子証明への移行はこのリポジトリにありません。
- snarkjs / Node.js の実行は定数時間であることを主張しません。
- `--secret` はプロセス一覧に出ることがあります。
- witness は証明中にプロセスメモリへ載ります。mini は witness ファイルを書きません。
- 暗号検証を省いたスタブ検証はありません。検証は snarkjs の Groth16、ダイジェストは Node.js の SHA-256、署名は @noble/post-quantum の ML-DSA-87 です。

## ディレクトリ

```text
circuit/main.circom
circuit/main.r1cs
circuit/main.wasm
circuit/mini.zkey
keys/verification_key.json
artifacts/manifest.json
artifacts/manifest.sha256
src/prover/
src/verifier/
src/integrity/
src/authenticity/
src/cli/
tests/positive/
tests/negative/
tests/tamper/
tests/authenticity/
fixtures/valid/
fixtures/invalid/
scripts/build.js
.github/workflows/ci.yml
```

## SDK

プロセス内 API は `src/index.js` です。HTTP サーバはありません。

```javascript
import { checkIntegrity, poseidonCommitment, prove, verify } from "./src/index.js";

await checkIntegrity();
const secret = 1n;
const commitment = await poseidonCommitment(secret);
const envelope = await prove({ secret: secret.toString(), commitment });
const ok = await verify(envelope);
```

ASSUMPTION: 「SDK」はこの Node.js モジュールです。ネットワーク API や v2 へのアダプタは Phase 5 の延長であり、この版には入れていません。

## CI

`.github/workflows/ci.yml` は Node.js 22 で次を実行します。

```text
npm ci
npm run build
positive tests と CLI / 分離テスト
negative tests
tamper tests と ML-DSA tests
npm run integrity
```

## ライセンス

GPL-3.0-or-later です。snarkjs、circomlib、circomlibjs が GPL-3.0 であるため、mini も同じライセンスにしています。全文は `LICENSE` です。

## 今後の延長

- 複数貢献者のセレモニー、または外部で廃棄済みの phase-1 を使う開発手順
- 信頼済み ML-DSA 公開鍵を設定した環境では `verify` が署名も必須にする運用
- v2 と mini の出力を成果物共有なしで並べる比較ハーネス
- v2 側に残している STARK / 耐量子証明への移行
