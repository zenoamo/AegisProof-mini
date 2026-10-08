# Threat model

この文書は、AegisProof-mini が自分の検査で扱える範囲と、扱えない範囲を並べます。experimental / reference implementation のモデルであり、本番の脅威分析の完了を意味しません。

開発用セレモニーは単一貢献者で、`ceremony.production` は `false` です。Groth16 の検証結果は、その verification key の下での受理です。トラップドアを持たない攻撃者に対する本番の健全性は、このセレモニーからは出てきません。

## 防げるものと防げないもの

| Threat | Attack Surface | Mitigation | Residual Risk |
| --- | --- | --- | --- |
| modified WASM | `circuit/main.wasm` を差し替え、別の witness 計算をさせる | `checkIntegrity` が manifest の SHA-256 と不一致なら `prove` / `verify` / `integrity` / `sign` を止める。改ざんテストがある | manifest と `manifest.sha256` も一緒に差し替えられると、SHA-256 だけでは止まらない。その場合の外部の真正性は、別途信頼した ML-DSA 公開鍵があるときだけ |
| modified R1CS | `circuit/main.r1cs` を差し替え、別の制約に見せる | 同上。R1CS は manifest の対象 | 同上。加えて、開発用セレモニーのトラップドアがあれば、ファイルを変えなくても証明の意味は本番水準にならない |
| modified zkey | `circuit/mini.zkey` を差し替え、別の証明鍵で証明を作る | zkey は manifest の対象。不一致では証明生成と検証を止める。`keys:check` は zkey から書き出した verification key がファイルと一致するか、baseline のハッシュと一致するかを見る | セレモニーをやり直すと正規の zkey ハッシュも変わる。baseline と Git 履歴を同時に更新できる者は、アンカーごと差し替えられる。ハッシュの一致は「この baseline のファイルか」であり、「本番のセレモニーか」ではない。`zkey verify` は powers-of-tau が残っているビルド中だけ実行できる |
| modified verification key | `keys/verification_key.json` を差し替え、別の鍵で検証させる | verification key は manifest の対象。暗号検証の前に完全性検査がある | 攻撃者が manifest 一式を支配している場合、SHA-256 は新しい鍵を正規のものとして通す。`verify` は ML-DSA を見ない |
| modified manifest | `artifacts/manifest.json` のハッシュや `production` フラグを書き換える | `manifest.sha256` がバイト列と不一致なら失敗する。`production !== false` も失敗する | `manifest.json` と `manifest.sha256` を同時に、実ファイルに合わせて書き換えられると、自己一致は残る |
| unauthorized artifact replacement | 正規の成果物一式を、攻撃者の生成した一式と入れ替える | ファイル単体の改ざんは SHA-256 で落ちる。任意の ML-DSA-87 は、信頼した公開鍵の署名が無い一式を拒否できる | 公開鍵の配布と信頼はツールの外。署名が無い状態では `verify` は通る。リポジトリは ML-DSA 公開鍵を同梱していない |
| invalid proof | 制約を満たさない witness や、壊れた証明オブジェクト | 証明生成は制約失敗で止まる。`snarkjs.groth16.verify` が受理しなければ `verify` は失敗する。Solidity の `verifyProof` も不正な証明で false | 検証は同梱の verification key に対する検査。その鍵のトラップドアを持つ者に対する偽造耐性は、この開発用セレモニーでは主張しない |
| tampered public signal | `publicSignals` の `commitment` を別の値にする | スキーマは長さ 1。別の commitment では Groth16 検証が失敗する。空や 30 要素は拒否する。Sepolia テストも改ざんした commitment を false にする | 公開値そのものは秘密ではない。別の正しい `secret` から作った別の commitment は、その組としては正当な証明になる |
| dependency compromise | `snarkjs`、`circomlib`、`circomlibjs`、`@noble/post-quantum`、または Sepolia 用の Hardhat / ethers を差し替える | `package-lock.json` と `npm ci`。CI も `npm ci` を使う | manifest は `node_modules` をハッシュしない。ロックファイルの更新を人が確認しないと、依存の差し替えは完全性検査の対象外 |
| compromised developer environment | ビルドマシン、PATH 上の circom、または作業ツリーを改ざんする | circom `2.2.3` が PATH に無いときは、ピンした公式バイナリの SHA-256 を確認してから使う。成果物ハッシュは manifest に残る | 既に信頼したマシンがセレモニー中のエントロピーや鍵を抜くことは、このリポジトリの検査では防げない。トラップドアがメモリから消えたことも証明していない |
| malicious Sepolia transaction | 偽の証明で `verifyAndRecord` を呼ぶ、または別コントラクトへ誘導する | コントラクトは Groth16 を検査し、改ざんした証明や commitment では `verifyProof` が false。デプロイ前に chain ID `11155111` と bytecode を確認する | コントラクトは結果の bool を記録できる。false の記録は「検査した」であり「証明が正しい」ではない。チェーンは成果物の SHA-256 も ML-DSA も見ない。RPC や秘密鍵を騙し取る取引は、コントラクトの検査の外 |
| private key exposure | `SEPOLIA_PRIVATE_KEY`、ML-DSA 秘密鍵、または `commit --secret` の回路秘密が漏れる | 秘密鍵は環境変数からのみ読む。`.env`、`*.mldsa.sk`、`input.json`、`proof.json` は `.gitignore` の対象。証明封筒に `secret` を書かない。ログへ秘密鍵を出さない実装 | `commit --secret` はプロセス一覧から見えることがある。漏れた鍵の無効化や、開発マシンの保護は、このリポジトリの範囲外。Sepolia の鍵が漏れれば、そのアドレスのテストネット資金は移せる |
| dev ceremony trapdoor assumptions | 単一貢献者がフェーズ1とフェーズ2のトラップドアを保持したまま、任意の証明を作る | 成果物ファイルへトラップドアを書かない。`toxicWastePersisted` は `false`。manifest は `production: false` を要求し、本番鍵として読み込ませない | 単一貢献者セレモニーでは、貢献者がトラップドアを捨てたことを第三者が検証できない。したがって、この verification key は本番の健全性の根拠にならない。Sepolia に同じ鍵を載せても、この残リスクは残る |

## 層ごとの残り

SHA-256 が止めるのは、manifest を更新せずにファイルだけを変える変更です。ML-DSA-87 が追加で止めるのは、あらかじめ信頼した公開鍵の署名が無い成果物ダイジェストです。Groth16 が止めるのは、その verification key と公開 `commitment` に対して受理されない証明です。Sepolia はその Groth16 検査の実行場所であり、前の三つの残リスクを消しません。
