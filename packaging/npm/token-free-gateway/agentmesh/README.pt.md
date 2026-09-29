# Integração MuhanAI × OpsMaxx — Português (Portuguese)

> Esta é a tradução para português de [README.md](../README.md). O original em inglês é sempre a versão mais recente.

## O que você ganha

A malha de agentes MuhanAI agora pode operar **infraestrutura real** em seu nome — e **suas chaves API nunca saem da sua máquina**.

| Capacidade      | O que o agente pode fazer                         | O que fica na sua máquina              |
| --------------- | ------------------------------------------------- | -------------------------------------- |
| SSH             | abrir sessões, executar comandos, acompanhar logs | cada comando exige sua aprovação       |
| SFTP            | ler e escrever arquivos                           | as escritas exigem sua aprovação       |
| Bancos de dados | executar SELECT, aplicar escritas                 | as escritas exigem _dupla_ aprovação   |
| Túneis          | abrir SOCKS5 / WireGuard / OpenVPN                | cada abertura exige sua aprovação      |
| Cofre           | ler metadados, guardar novos segredos             | os segredos nunca saem do host OpsMaxx |

## Como se encaixa

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← o usuário vê os prompts e aprova as escritas
│  (muhanai.com)   │
└────────┬─────────┘
         │ Compatível com OpenAI + MCP
         ▼
┌──────────────────┐  Contrato OpsMaxxBridge   ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx desktop  │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • cartão aprov.  │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  outros agentes / outras máquinas / listas bot.muhanai.com
```

## Modelo de ameaça em um parágrafo

O modo de falha mais perigoso em um "agente de navegador" é o modelo executar `DROP TABLE users;` sem o usuário ver. A integração trata cada ação como pertencente a uma das três classes de risco (`safe` / `needs-approval` / `high-risk-needs-double-approval`), declaradas uma vez no mapa `RISK` em `packages/opsmaxx-bridge/src/types.ts`. A camada MCP em `mcp-routes.ts` consulta a classe de cada ferramenta e a roteia pela guarda human-in-the-loop existente antes de encaminhar ao OpsMaxx. O log de auditoria registra cada chamada, para que uma decisão do modelo possa ser reconstruída depois.

## Início rápido (desenvolvedor)

```bash
# 1. Instale o OpsMaxx (grátis, MIT, sem conta)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. Adicione as entradas SSH/DB/cofre que o agente usará
#    Cada entrada aparece no painel do MuhanAI como "Trusted peer"
#
# 3. Execute o agent-daemon do MuhanAI localmente
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## Início rápido (usuário final)

1. Instale o [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx).
2. Faça login em [muhanai.com](https://muhanai.com) e abra a página _Trusted peers_ (P2P → OpsMaxx).
3. Emparelhe a instância local do OpsMaxx clicando em "Approve" no cartão de aprovação que aparece no OpsMaxx.
4. Peça ao agente qualquer coisa que precise de infraestrutura real. Observe os cartões de aprovação.

## Status das trilhas

- **T1** (contrato bridge + mock): concluído
- **T2** (sincronização bidirecional do cofre): concluído
- **T3-A** (superfície MCP segura): concluído
- **T3-B** (superfície MCP de escrita + auditoria): em andamento
- **T4** (UI de malha P2P): concluído
- **T5** (integração DaedalOS): concluído
- **T6** (documentação multilíngue): este documento

## Licença

Ambos os projetos são MIT.
