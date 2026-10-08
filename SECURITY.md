# Security policy

AegisProof-mini は、Groth16 証明の生成と検証、SHA-256 による成果物完全性、任意の ML-DSA-87 真正性を同じツリーで試す experimental / reference implementation です。`package.json` の説明も experimental であり、AegisProof v2 ではないと書いています。本番システムではなく、production の保証はありません。

Ethereum Sepolia への接続（`experimental/sepolia/`）は、同じ Groth16 検証をテストネット上で実行する experimental integration layer です。Core protocol ではありません。

## 報告してほしいこと

次のような、実装が自分の検査を破っている問題を対象にします。

- 不正な証明や改ざんした public signal を、`verify` または Solidity verifier が受理する
- 成果物の SHA-256 が manifest と一致しないのに、`prove` / `verify` / `integrity` / `sign` が続行する
- 秘密の witness が、証明ファイル、標準出力、または Git に載る成果物へ書かれる
- ML-DSA-87 の検証が、対象ダイジェストやコンテキストを取り違える
- Sepolia 用スクリプトが、秘密鍵や RPC URL をログ、README、deployment ファイルへ書く

ドキュメントにすでに書いてある限界そのものは、未修正の脆弱性としては扱いません。たとえば開発用セレモニーが単一貢献者であること、SHA-256 だけでは manifest ごと差し替える攻撃者を止められないこと、`verify` が ML-DSA を見ないことは、既知の制限です。

## 報告方法

このリポジトリは、別のメールアドレスを公開していません。未修正の脆弱性は、公開の GitHub Issue に書かず、GitHub の private vulnerability reporting / Security Advisory を使ってください。

https://github.com/zenoamo/AegisProof-mini/security/advisories/new

プライベート報告のフォームがリポジトリ設定で無効な場合でも、詳細を公開 Issue や pull request に書かないでください。そのときは GitHub 上で Security Advisory を作れるメンテナ経路を使い、公開チャネルには「非公開で報告したい」とだけ書いてください。

## 報告に含めないもの

報告には次を入れないでください。

- private key、mnemonic、seed phrase
- RPC URL や API key などの credential
- `.env` の内容
- 回路の `secret`、witness、その他の private input
- 未修正の脆弱性を再現できる完全な詳細を、公開 Issue に書くこと

公開アドレス、chain ID、すでにリポジトリへ記録済みの contract address や transaction hash は公開情報です。秘密と一緒に送る必要はありません。

## 受け取ったあとの方針

このリポジトリは応答時間を保証しません。報告を受け取った場合の基本方針は次です。

1. 公開チャネルへ詳細を転記しない
2. 対象がこのリポジトリの記述と実装の範囲かを確認する
3. 再現できるものは、記載されたバージョンと成果物に対して確認する
4. 修正するときは、既存のテストに加え、その不具合を検出するテストを添える
5. 修正の公開時に、必要なら GitHub Security Advisory で概要を出す

開発用セレモニーの置き換えや、本番運用の設計変更は、脆弱性の修正とは別に検討します。

## Cryptographic assumptions

検証が成功したときの意味は、「同梱の verification key の下で、公開 `commitment` に対する Groth16 証明が受理された」です。

- 証明方式は Groth16、曲線は BN254 です。snarkjs のファイル上の曲線名は `bn128`、mini の manifest と証明封筒の曲線名は `bn254` です。この実装では同じ曲線を指します。
- 回路の制約は `commitment === Poseidon(secret)` です。`Poseidon` は circomlib の `Poseidon(1)` です。
- Groth16 の健全性は、証明鍵のトラップドアが偽造者に渡っていないことに依存します。このリポジトリのセレモニーはその前提を本番水準では満たしません。

## Dev ceremony

AegisProof-mini currently uses a single-contributor development ceremony.

`artifacts/manifest.json` の `ceremony` は、貢献者 1、`production: false`、`toxicWastePersisted: false` です。`checkIntegrity` は `production` が `false` でない manifest を拒否します。

これは開発用の単一貢献者セレモニーです。production-grade のマルチパーティセレモニーではなく、AegisProof v2 の `production.zkey` でもありません。toxic waste の破棄を独立に検証する記録はありません。ビルドはトラップドアを成果物ファイルへ保存しません。プロセスメモリ上の値が消えることは、このリポジトリは証明していません。SHA-256 の完全性検査と ML-DSA-87 の署名は、この setup assumption を消しません。trustless setup ではありません。

Groth16 検証の成功は、その verification key の下で証明が受理されたことです。セレモニーを信頼できるかは、それとは別の問題です。コミット済み成果物の対応確認は [docs/KEY_MANAGEMENT.md](docs/KEY_MANAGEMENT.md) にあります。

## SHA-256 artifact integrity

`checkIntegrity` は、`artifacts/manifest.sha256` と `artifacts/manifest.json`、および manifest が指す wasm、r1cs、zkey、verification key の SHA-256 が、手元のファイルと一致するかを見ます。`prove`、`verify`、`integrity`、`sign` はこの検査を外すフラグを持ちません。

これは手元のファイルと手元の manifest の自己一致です。manifest と対象ファイルと `manifest.sha256` をまとめて差し替えられる状況では、SHA-256 だけでは外部の信頼の根になりません。証明が数学的に正しいこと自体を、SHA-256 が証明するわけでもありません。

## ML-DSA-87

ML-DSA-87 は任意の artifact authenticity layer です。署名対象は、成果物ハッシュをキー名でソートした JSON の SHA-256 です。コンテキストは `aegisproof-mini/manifest-authenticity/v1` です。実装は `@noble/post-quantum` の `ml_dsa87` です。

`verify` はこの署名を呼びません。リポジトリは信頼する公開鍵を同梱していません。どの公開鍵を信頼するかは、このツールの外で決める前提です。ML-DSA-87 は Groth16 の置換ではありません。

## Dependency と supply chain

実行時の依存は `package.json` と `package-lock.json` で固定します。manifest の対象に `node_modules` は入りません。CI は `npm ci` を使います。ロックファイルに無いパッケージを検証の前提にしないでください。

`package.json` の `overrides` は、親パッケージの semver 範囲では修正版に届かない transitive dependency だけを、その親の呼び出し方を確認したうえで差し替えています。直接依存には加えていません。

| override | 理由 |
| --- | --- |
| `underscore@1.13.8` | `snarkjs` → `bfj` → `jsonpath` が `1.13.6` を固定している。`1.13.8` は同じ 1.13 系の修正版 |
| `@ethersproject/providers` の `ws@8.21.0` | `circomlibjs` が依存する ethers 5 が `ws@8.18.0` を固定している。Hardhat 自身の `ws@7` は対象外なので、全体の `ws` は上げていない |
| `mocha` の `serialize-javascript@7.1.2` | Hardhat 2.29 の mocha 11 は `^6.0.2` のまま。mocha は関数として呼ぶだけで、7 系でもその形 |
| `hardhat` の `adm-zip@0.6.1` | Hardhat 2.29 は `^0.4.16`。使っているのは `new AdmZip(path)` と `extractAllTo` |
| `hardhat` の `undici@6.29.0` | Hardhat 2.29 は undici 5。6.29 は `request`、`Pool`、`ProxyAgent`、`Client`、`Agent` を持つ 6 系の修正版。undici 7 以降には上げていない |
| `hardhat` の `uuid@11.1.1` | 修正版は 11 系で、8 系には戻されていない。Hardhat は `v4` だけを動的 import する |
| `solc` の `tmp@0.2.7` | solc は `tmp@0.0.33` を固定し、`fileSync({ postfix })` だけを使う |
| `@sentry/node` の `cookie@0.7.2` | Hardhat の `@sentry/node@5` は `cookie@^0.4.1`。0.7 は修正が入った 0.x の最終版で、cookie 1 以降には上げていない |

`ethers` 6 は `^6.17.0` です。この版が直接依存する `ws` は `8.21.0` で、8.20.1 未満の修正範囲に入ります。

`elliptic@6.6.1` は `circomlibjs` → ethers 5 から入ります。公開されている最新版が 6.6.1 であり、置き換える修正版はありません。`snarkjs`、`circomlib`、`circomlibjs`、Hardhat 3 への major 更新では解消していません。

circom は pragma `2.2.2`、このスナップショットのコンパイラ記録は `2.2.3` です。PATH にその版が無いとき、ビルドは `tools/circom-2.2.3-sha256.json` の公式バイナリを取得して SHA-256 を確認します。

## Sepolia

`experimental/sepolia/` は Core の回路、prover、verifier、integrity、authenticity を置き換えません。オンチェーンの `verifyProof` が true であることは、この verification key の下で Groth16 証明が受理されたことであり、成果物の SHA-256 完全性や ML-DSA-87 真正性がチェーン上で確認されたことにはなりません。

Sepolia はテストネットです。秘密鍵は `SEPOLIA_PRIVATE_KEY` からのみ読み、ソースやドキュメントへ書きません。

## このプロジェクトが保証しないもの

- 本番環境での利用に足る安全性
- マルチパーティセレモニー、またはトラップドアが廃棄されたこと
- `verify` の成功が ML-DSA-87 の成功でもあること
- SHA-256 検査が、manifest 一式の差し替えに対する外部の真正性になること
- TEE、ClaimsGate、AegisProof v2 の 30 フィールド claims
- 耐量子の証明方式への移行。ML-DSA-87 は成果物ダイジェストへの任意の署名です
- mainnet での検証
- 秘密がプロセス一覧や開発マシンのメモリから見えないこと。`commit --secret` は、秘密がプロセス一覧から見えることがあると警告します
