# Integración MuhanAI × OpsMaxx — Español (Spanish)

> Esta es la traducción al español de [README.md](../README.md). El original en inglés es siempre la versión más reciente.

## Qué obtienes

La malla de agentes de MuhanAI ahora puede operar **infraestructura real** en tu nombre — y **tus claves API nunca salen de tu máquina**.

| Capacidad      | Lo que el agente puede hacer                          | Lo que se queda en tu máquina               |
| -------------- | ----------------------------------------------------- | ------------------------------------------- |
| SSH            | abrir sesiones, ejecutar comandos, hacer tail de logs | cada comando requiere tu aprobación         |
| SFTP           | leer y escribir archivos                              | las escrituras requieren tu aprobación      |
| Bases de datos | ejecutar SELECT, aplicar escrituras                   | las escrituras requieren _doble_ aprobación |
| Túneles        | abrir SOCKS5 / WireGuard / OpenVPN                    | cada apertura requiere tu aprobación        |
| Vault          | leer metadatos, guardar nuevos secretos               | los secretos nunca salen del host OpsMaxx   |

## Cómo encaja

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← el usuario ve los prompts y aprueba escrituras
│  (muhanai.com)   │
└────────┬─────────┘
         │ OpenAI-compatible + MCP
         ▼
┌──────────────────┐  Contrato OpsMaxxBridge   ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx desktop  │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • tarjeta aprobación │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  otros agentes / otras máquinas / listas de bot.muhanai.com
```

## Modelo de amenaza en un párrafo

El modo de fallo más peligroso en un "agente de navegador" es que el modelo ejecute `DROP TABLE users;` sin que el usuario lo vea. La integración trata cada acción como perteneciente a una de tres clases de riesgo (`safe` / `needs-approval` / `high-risk-needs-double-approval`), declaradas una sola vez en el mapa `RISK` en `packages/opsmaxx-bridge/src/types.ts`. La capa MCP en `mcp-routes.ts` consulta la clase de cada herramienta y la enruta a través del guardián human-in-the-loop existente antes de reenviar a OpsMaxx. El log de auditoría registra cada llamada para que una decisión del modelo pueda reconstruirse después.

## Inicio rápido (desarrollador)

```bash
# 1. Instalar OpsMaxx (gratis, MIT, sin cuenta)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. Añade las entradas SSH/DB/vault que el agente podrá usar
#    Cada entrada aparece en el dashboard de MuhanAI como "Trusted peer"
#
# 3. Ejecuta el agent-daemon de MuhanAI localmente
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## Inicio rápido (usuario final)

1. Instala [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx).
2. Inicia sesión en [muhanai.com](https://muhanai.com) y abre la página _Trusted peers_ (P2P → OpsMaxx).
3. Empareja la instancia local de OpsMaxx haciendo clic en "Approve" en la tarjeta de aprobación que aparece en OpsMaxx.
4. Pide al agente cualquier cosa que necesite infraestructura real. Observa las tarjetas de aprobación.

## Estado de los tracks

- **T1** (contrato bridge + mock): completado
- **T2** (sincronización bidireccional del vault): completado
- **T3-A** (superficie MCP segura): completado
- **T3-B** (superficie MCP de escritura + auditoría): en progreso
- **T4** (UI de malla P2P): completado
- **T5** (integración DaedalOS): completado
- **T6** (documentación multiidioma): este documento

## Licencia

Ambos proyectos son MIT.
