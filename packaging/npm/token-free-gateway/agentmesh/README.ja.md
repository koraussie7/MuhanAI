# MuhanAI × OpsMaxx 統合 — 日本語 (Japanese)

> これは [README.md](../README.md) の日本語訳です。英語版が常に最新版です。

## 何が手に入るか

MuhanAIエージェントメッシュが、あなたの代わりに**実際のインフラ**を操作できるようになりました — **APIキーはあなたのマシンを離れません**。

| 機能         | エージェントができること                   | あなたのマシンに残るもの               |
| ------------ | ------------------------------------------ | -------------------------------------- |
| SSH          | セッションを開く、コマンド実行、ログ追跡   | すべてのコマンドにはあなたの承認が必要 |
| SFTP         | ファイルの読み書き                         | 書き込みにはあなたの承認が必要         |
| データベース | SELECTクエリ実行、書き込み適用             | 書き込みには*二重*承認が必要           |
| トンネル     | SOCKS5 / WireGuard / OpenVPNを開く         | 開くたびにあなたの承認が必要           |
| ボールト     | メタデータ読み取り、新しいシークレット保存 | シークレットはOpsMaxxホストを離れない  |

## 仕組み

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← ユーザーがプロンプトを見て書き込みを承認
│  (muhanai.com)   │
└────────┬─────────┘
         │ OpenAI互換 + MCP
         ▼
┌──────────────────┐  OpsMaxxBridge契約       ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxxデスク   │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • 承認カード     │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  他のエージェント / 他のマシン / bot.muhanai.comリスト
```

## 脅威モデル — 1段落要約

「ブラウザエージェント」の最も危険な失敗モードは、モデルがユーザーに気づかれずに `DROP TABLE users;` を実行することです。統合はすべてのアクションを3つのリスククラス(`safe` / `needs-approval` / `high-risk-needs-double-approval`)のいずれかに分類し、`packages/opsmaxx-bridge/src/types.ts` の `RISK` マップで一度だけ宣言します。`mcp-routes.ts` のMCPレイヤーは各ツールのクラスを参照し、OpsMaxxに転送する前に既存のhuman-in-the-loopガードを経由させます。監査ログはすべての呼び出しを記録するため、モデルの決定を後で再構築できます。

## クイックスタート(開発者)

```bash
# 1. OpsMaxxをインストール(無料、MIT、アカウント不要)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. エージェントが使用するSSH/DB/ボールトエントリを追加
#    各エントリはMuhanAIダッシュボードに「Trusted peer」として表示されます
#
# 3. MuhanAI agent-daemonをローカルで実行
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## クイックスタート(エンドユーザー)

1. [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx) をインストール。
2. [muhanai.com](https://muhanai.com) にログインし、_Trusted peers_ ページを開く (P2P → OpsMaxx)。
3. OpsMaxxに表示される承認カードで「Approve」をクリックして、ローカルのOpsMaxxインスタンスをペアリング。
4. 実際のインフラが必要なことを何でもエージェントに依頼。承認カードを見守る。

## トラック状況

- **T1** (ブリッジ契約 + mock): 完了
- **T2** (ボールト双方向同期): 完了
- **T3-A** (MCP安全サーフェス): 完了
- **T3-B** (MCP書き込みサーフェス + 監査): 進行中
- **T4** (P2PメッシュUI): 完了
- **T5** (DaedalOS埋め込み): 完了
- **T6** (多言語ドキュメント): このドキュメント

## ライセンス

両プロジェクトともMIT。
