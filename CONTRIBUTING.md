# Contributing

AegisProof-mini は、小さな回路で Groth16 証明、検証、成果物の完全性を再現するための experimental / development reference です。本番システムではなく、AegisProof v2 の代替でもありません。

参加するときは、実装・テスト・README・`package.json` の記述を互いに矛盾させないでください。

## AegisProof v2 との違い

このリポジトリは AegisProof v2 の Frozen Core を含まず、それを変更しません。`production.zkey`、v2 の WASM、v2 の R1CS は使いません。公開信号は `commitment` の 1 個です。v2 の 30 フィールド publicSignals は `fixtures/invalid/v2-public-signals.json` にある形を mini が拒否する、という範囲で区別しています。v2 の実装詳細を、このツリーに無い情報から推測して書かないでください。

## 境界

| 層 | 場所 | 役割 |
| --- | --- | --- |
| Core | `circuit/main.circom`、`src/prover/`、`src/verifier/` | Poseidon commitment の Groth16 証明と検証 |
| Integrity | `src/integrity/`、`artifacts/manifest.json` | 成果物の SHA-256 自己一致 |
| Authenticity | `src/authenticity/mldsa.js` | 任意の ML-DSA-87。`verify` は呼ばない |
| Experimental Sepolia | `experimental/sepolia/` | 同じ Groth16 検証を Ethereum Sepolia で実行する拡張 |

Core の証明意味を変える変更と、Sepolia の呼び出し方の変更は別の変更です。Sepolia 側から Core の回路、zkey、verification key、既存テストの意味を書き換えないでください。

## 開発環境

- Node.js 20 以上。CI（`.github/workflows/ci.yml`）は Node.js 22 です。
- 依存は `npm ci` で入れてください。`package-lock.json` が固定です。

```bash
npm ci
npm test
npm run integrity
npm run keys:check
npm run sepolia:test
```

`npm test` は `tests/**/*.test.js` です。`npm run sepolia:test` は Hardhat 上の Solidity verifier です。Sepolia の deployment ファイルが無いときは、チェーンとの比較は pending になり、ローカルの正例と反例だけが実行されます。

`npm run build` は開発用セレモニーをやり直します。zkey、verification key、manifest のハッシュは変わります。スナップショットのハッシュを保ったまま動作を確認するときは、ビルドしないでください。

## Pull request

- 変更の理由と、どの層（Core / Integrity / Authenticity / Sepolia）に触れるかを書いてください。
- 既存の `npm test` と `npm run integrity` が通る状態にしてください。Sepolia に触れるときは `npm run sepolia:test` も実行してください。
- README、`docs/`、`package.json` のコマンドやバージョンが実装とずれたら、同じ変更で直してください。
- 存在しない機能、本番保証、v2 との未確認の互換性を書かないでください。

## 暗号コードを変えるとき

回路、証明、検証、完全性、真正性、verification key、zkey に触れる変更は security-sensitive です。

- 変更後の命題を、公開信号の本数と制約の意味が分かる形で説明してください。
- 正常系に加え、改ざんや不正入力が失敗するテストを追加または更新してください。
- 成果物を再生成したときは、manifest と README / `docs/REPRODUCIBILITY.md` のハッシュを、実際に計算した値へ更新してください。`artifacts/baseline.json` は `npm run build` が更新しないアンカーです。新しい鍵を採用するときは、baseline を同じ変更で明示的に更新してください。
- `verify` に ML-DSA を混ぜないでください。SHA-256 の完全性、ML-DSA-87 の真正性、Groth16 の証明検証は別の質問に答えます。
- 開発用セレモニーを本番セレモニーとして記述しないでください。`ceremony.production` は `false` のまま検査されます。AegisProof-mini currently uses a single-contributor development ceremony. trustless setup とは書きません。

セキュリティ上の未修正の問題は、公開の pull request に詳細を書かず、[SECURITY.md](SECURITY.md) の非公開報告を使ってください。

## 秘密情報

commit に次を含めないでください。`.gitignore` がすでに除外しているものも、強制的に追加しないでください。

- `.env`、private key、mnemonic、seed phrase、RPC credential
- `input.json`、`proof.json`、witness
- `*.mldsa.sk`、`keys/*secret*`、`artifacts/manifest.sig`、`keys/mldsa_public.json`

Sepolia の公開アドレス、contract address、transaction hash は、実際の deployment 記録に基づくときだけドキュメントへ書けます。推測で値を作らないでください。
