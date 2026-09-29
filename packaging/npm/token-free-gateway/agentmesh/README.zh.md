# MuhanAI × OpsMaxx 集成 — 中文 (Chinese)

> 这是 [README.md](../README.md) 的中文翻译。英文原版始终是最新版本。

## 你能得到什么

MuhanAI 智能体网格现在可以代表你操作**真实的基础设施** — 而**你的 API 密钥永远不会离开你的机器**。

| 功能   | 智能体可以做什么                  | 保留在机器上的内容            |
| ------ | --------------------------------- | ----------------------------- |
| SSH    | 打开会话、执行命令、跟踪日志      | 每个命令都需要你的批准        |
| SFTP   | 读写文件                          | 写入需要你的批准              |
| 数据库 | 执行 SELECT 查询、应用写入        | 写入需要*双重*批准            |
| 隧道   | 打开 SOCKS5 / WireGuard / OpenVPN | 每次打开都需要你的批准        |
| 保险库 | 读取元数据、存储新密钥            | 密钥永远不会离开 OpsMaxx 主机 |

## 如何组合

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← 用户查看提示并批准写入
│  (muhanai.com)   │
└────────┬─────────┘
         │ 兼容 OpenAI + MCP
         ▼
┌──────────────────┐  OpsMaxxBridge 契约    ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx 桌面    │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • 批准卡片       │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  其他智能体 / 其他机器 / bot.muhanai.com 列表
```

## 威胁模型 — 一段话总结

"浏览器智能体"最危险的失败模式是模型在用户不知情的情况下执行 `DROP TABLE users;`。该集成将每个操作视为属于三个风险类别之一（`safe` / `needs-approval` / `high-risk-needs-double-approval`），在 `packages/opsmaxx-bridge/src/types.ts` 的 `RISK` 映射中仅声明一次。`mcp-routes.ts` 中的 MCP 层查找每个工具的类别，并通过现有的人类在环守卫将其转发到 OpsMaxx 之前。审计日志记录每个调用，以便以后可以重建模型决策。

## 快速开始(开发者)

```bash
# 1. 安装 OpsMaxx(免费、MIT、无需账户)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. 添加智能体将使用的 SSH/数据库/保险库条目
#    每个条目在 MuhanAI 仪表板中显示为"Trusted peer"
#
# 3. 在本地运行 MuhanAI agent-daemon
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## 快速开始(最终用户)

1. 安装 [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx)。
2. 登录 [muhanai.com](https://muhanai.com) 并打开 _Trusted peers_ 页面 (P2P → OpsMaxx)。
3. 通过点击 OpsMaxx 中出现的批准卡片上的"Approve"来配对本地 OpsMaxx 实例。
4. 向智能体请求任何需要真实基础设施的事情。观察批准卡片。

## 轨道状态

- **T1**(桥接契约 + mock):已完成
- **T2**(保险库双向同步):已完成
- **T3-A**(MCP 安全表面):已完成
- **T3-B**(MCP 写入表面 + 审计):进行中
- **T4**(P2P 网格 UI):已完成
- **T5**(DaedalOS 嵌入):已完成
- **T6**(多语言文档):本文档

## 许可证

两个项目都是 MIT。
