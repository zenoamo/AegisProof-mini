# ローカル TEE 実験レイヤー

このディレクトリは、AegisProof-mini の既存の証明 API と、将来の TEE バックエンドのあいだに置く実験用インターフェースです。ここで動くバックエンドは通常の Node.js プロセスです。ハードウェア隔離もリモートアテステーションも実装しておらず、検証してもいません。

## 目的

- アプリケーションとバックエンドの呼び出し境界を先に固定する。
- その境界を、ネットワークも専用ハードウェアも使わずにテストする。
- Poseidon コミットメント、Groth16 証明生成、証明検証は `experimental/mini-0.2.0/src/index.js` を呼ぶ。ルートの `src/index.js` は 0.1.0 の公開面のままである。
- あとから別実装のバックエンドへ差し替えられる引数の形にしておく。
- 秘密入力 `secret` を公開結果へ出さない。

このレイヤーの成功は「インターフェースとデータフローが動いた」ことまでです。TEE の安全性を示したことにはなりません。

## ディレクトリ

```text
experimental/local-tee/
├── README.md
├── src/
│   ├── adapter.js        アプリケーション側。バックエンドを注入する
│   ├── local-backend.js  通常プロセスの実験バックエンド
│   └── envelope.js       この実験層の公開結果。証明エンベロープとは別物
└── tests/
    ├── adapter.test.js
    └── adapter.integration.test.js
```

`experimental/sepolia/` と回路、証明鍵、検証鍵は変更しません。

## バックエンドインターフェース

バックエンドは次の二つの非同期関数を持ちます。

`identify()` は識別情報を返します。

```json
{
  "id": "local-process",
  "kind": "local-process",
  "claims": {
    "hardwareIsolation": false,
    "remoteAttestation": false
  },
  "attestation": null
}
```

`prove({ secret, context, policyId, epoch, commitment, nullifier, contextHash })` は、0.2.0 の秘密入力と、アダプターが計算した公開値を受け取り、次だけを返します。コミットメントだけの 0.1.0 入力ではありません。

```json
{
  "commitment": "<decimal field element>",
  "envelope": "<既存の AegisProof-mini 証明エンベロープ>"
}
```

`secret` は引数として境界を越えます。戻り値のフィールドにはしません。`identify()` の `claims` と `attestation` は、将来の実装が情報を足せる位置です。このバージョンのアダプターは、`hardwareIsolation` または `remoteAttestation` が `true` の主張と、`null` 以外の `attestation` を拒否します。検証器が無い主張を成功として通さないためです。

## データフロー

1. 呼び出し元が `{ secret, context, policyId, epoch }` を `createAdapter(backend).prove` に渡す。`commitment` は任意で、渡した場合は計算結果と一致しなければならない。
2. アダプターが各フィールドを既存のフィールド要素検査で確認する。値そのものはエラー文へ入れない。
3. アダプターが既存の `statementFromParts` で 5 個の公開信号を計算する。
4. アダプターが `backend.identify()` を確認する。未検証の TEE 主張はここで失敗する。
5. バックエンドが既存の `prove` を、secret、context、policyId、epoch と計算済みの公開値で呼ぶ。ローカルバックエンドはファイルへ秘密を書かない。
6. アダプターは戻り値を信用しない。`secret` フィールドが無いこと、コミットメントが一致すること、既存の `readEnvelope` を通ること、公開シグナル 5 個が計算結果と一致すること、既存の `verify` が `true` であることを確認する。`verify` は ML-DSA を呼ばない。
7. 公開結果を返す。`verify` が `false` のとき、成功結果は作らない。

既存の `prove` と `verify` は、これまでどおり完全性検査 `checkIntegrity` を先に行います。このレイヤーはその検査を飛ばしません。

## 秘密入力と公開データ

回路の秘密入力は `secret` と `context` です。`policyId` と `epoch` は公開信号です。公開データは Poseidon の 5 信号、Groth16 証明、バックエンドの識別情報です。

既存の証明エンベロープ（`aegisproof-mini-public-signals-v2`）には秘密を入れません。この実験層の公開結果（`aegisproof-mini-local-tee-result-v1`）にも秘密フィールドを作りません。`secret` が現れてよいのは、バックエンドの `prove` への引数だけです。

JavaScript の文字列と BigInt は、参照を消してもメモリから確実に消えるとは限りません。この実装はその消去を保証しません。行うのは、公開結果・エラーメッセージ・ログ・不要なファイルへ秘密を出さないことです。

## ローカルバックエンドの制約

`createLocalBackend()` は同じ Node.js プロセスです。

- ハードウェア隔離は無い。
- リモートアテステーションは無い。`attestation` は `null` であり、偽の quote や証明書は作らない。
- 外部サービスへの接続は不要。
- 秘密入力のログ出力と、秘密のためのファイル保存は行わない。
- コミットメントは同じ `secret` に対して決定的です。Groth16 証明のバイト列は snarkjs のランダム性で変わり得ます。テストが固定するのはコミットメント、検証結果、識別情報です。

## 通常のプロセスと TEE の違い

TEE は、その実装が正しければ、プロセス外から秘密メモリを直接読めないことと、遠隔の検証者へ実行環境の証拠を示せることを目的にします。このローカルバックエンドにはそのどちらもありません。アプリケーションとバックエンドは同じプロセスであり、OS からもデバッガからも区別されません。

## リモートアテステーション

未実装です。`attestation: null` は「証拠が無い」という意味であり、検証に成功したという意味ではありません。公開結果の `verified.hardwareIsolation`、`verified.remoteAttestation`、`verified.attestation` は、このバージョンでは常に未検証（`false` / `null`）です。

## テスト

リポジトリ直下で次を実行します。

```powershell
npm run test:local-tee
```

`adapter.test.js` は注入したバックエンドでインターフェース、入力、失敗、秘密の漏洩、スキーマを確認します。証明生成は行いません。

`adapter.integration.test.js` は既存の `poseidonCommitment`、`prove`、`verify` を実際に呼びます。改ざんした公開シグナルは `verify` が `false` になり、アダプターの成功結果にはなりません。

既存の `npm test` はそのままです。この実験層はそちらの対象外です。

## 実行例

```javascript
import { createAdapter } from "./experimental/local-tee/src/adapter.js";
import { createLocalBackend } from "./experimental/local-tee/src/local-backend.js";

const adapter = createAdapter(createLocalBackend());
const result = await adapter.prove({
  secret: "<decimal field element>",
  context: "<decimal field element>",
  policyId: "<decimal field element>",
  epoch: "<decimal field element>",
});

// result.commitment と result.proofEnvelope は公開データ。
// result.verified.hardwareIsolation は false。
// result.verified.attestation は null。
```

値はフィールド未満の正規十進文字列です。`commitment` を同時に渡す場合は、`statementFromParts` が計算する `Poseidon(secret)` と一致する必要があります。

## 本物の TEE バックエンドへ差し替えるとき

少なくとも次が別途必要です。

- TEE 内で `secret` を受け取り、外へはコミットメントと証明エンベロープだけを返す実装。
- その実行環境に対応したリモートアテステーションの検証器。検証に成功するまで `verified` を真にしない。
- このアダプターが現在行っている「TEE 主張は拒否する」という閉失敗を、検証器の成功結果に限って通す変更。スキーマバージョンを上げる。
- ホスト側のログ、クラッシュダンプ、スワップへ秘密が出ないことの、その製品ごとの確認。

差し替え前に、このディレクトリのテストが成功していても、上記は未実施のままです。

## 現段階で言えること

言えること:

- ローカルプロセス経由で、既存のコミットメント、証明生成、証明検証へ接続できる。
- 公開結果とエラーメッセージへ秘密フィールドを載せない、というこの実装の範囲はテストしている。
- バックエンドの自己申告と、検証に失敗した証明を、成功としては扱わない。

言えないこと:

- ハードウェア隔離があること。
- リモートアテステーションが成功していること。
- 秘密がプロセスメモリから消えていること。
- ホスト OS、同じプロセスの他のコード、デバッガから秘密が保護されていること。
