# Support

AegisProof-mini は experimental / reference implementation です。応答時間や本番のサポート契約はありません。

## どこへ書くか

| 内容 | 場所 |
| --- | --- |
| バグ。テストが失敗する、コマンドがドキュメントと違う、成果物の検査が説明と違う | GitHub Issues |
| 使い方の質問。ビルド、テスト、ディレクトリの役割 | GitHub Issues |
| Sepolia の手順、view call、deployment 記録の読み方 | GitHub Issues。秘密は書かない |
| 未修正の脆弱性。不正な証明の受理、完全性検査の回避、秘密の漏えい | [SECURITY.md](SECURITY.md) の GitHub Security Advisory。公開 Issue には書かない |
| 既知の限界についての確認 | 先にこのファイルの「既知の limitation」と README を読む。実装の欠陥ではなければ Issue の質問でよい |

公開 Issue には、private key、mnemonic、RPC credential、`.env`、回路の `secret`、witness を書かないでください。

## バグ報告に書いてほしいこと

- 実行したコマンド（`npm test`、`npm run integrity`、`npm run sepolia:test` など）
- Node.js のバージョン
- 期待した結果と、実際の結果
- 秘密や credential を除いたログ

`npm run build` のあとで zkey のハッシュが README のスナップショットと違うことは、開発用セレモニーが毎回同じバイト列を作らないための既知の動作です。それだけでは不具合ではありません。各ビルドの中で manifest とファイルが一致することが検査条件です。詳細は [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md) です。

## Sepolia

Sepolia は Ethereum のテストネット（chain ID `11155111`）です。`experimental/sepolia/` は experimental integration であり、Core の証明プロトコルではありません。

質問の前に [docs/SEPOLIA.md](docs/SEPOLIA.md) と README の「Sepolia Integration」を見てください。デプロイや検証トランザクションの失敗を報告するときは、transaction hash と chain ID は書いてよく、秘密鍵と RPC URL は書かないでください。残高不足は、スクリプトが停止する既知の動作です。mainnet は使いません。

## 既知の limitation

README の Known limitations と [SECURITY.md](SECURITY.md) に書いてある次の項目は、現在の仕様です。

- 信頼設定は single-contributor の development ceremony で、`ceremony.production` は `false` です。
- SHA-256 は、manifest とファイルをまとめて置き換える攻撃者に対する外部の真正性にはなりません。
- ML-DSA-87 は任意です。`verify` は署名を見ません。
- TEE、ClaimsGate、v2 の 30 フィールド publicSignals、STARK への移行は、このリポジトリにありません。
- オンチェーン検証は、開発用 verification key の下での Groth16 検査です。成果物の完全性検査をチェーンが肩代わりしません。

## 文書

設計の読み方は [docs/README.md](docs/README.md)、変更の出し方は [CONTRIBUTING.md](CONTRIBUTING.md) です。
