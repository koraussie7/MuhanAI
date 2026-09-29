# MuhanAI × OpsMaxx Integration — Deutsch (German)

> Dies ist die deutsche Übersetzung von [README.md](../README.md). Das englische Original ist immer die aktuellste Version.

## Was Sie bekommen

Der MuhanAI-Agenten-Mesh kann jetzt **echte Infrastruktur** in Ihrem Namen bedienen — und **Ihre API-Schlüssel verlassen niemals Ihre Maschine**.

| Funktion    | Was der Agent tun kann                              | Was auf Ihrer Maschine bleibt                   |
| ----------- | --------------------------------------------------- | ----------------------------------------------- |
| SSH         | Sitzungen öffnen, Befehle ausführen, Logs verfolgen | jeder Befehl erfordert Ihre Zustimmung          |
| SFTP        | Dateien lesen und schreiben                         | Schreibvorgänge erfordern Ihre Zustimmung       |
| Datenbanken | SELECT-Abfragen ausführen, Schreibvorgänge anwenden | Schreibvorgänge erfordern _doppelte_ Zustimmung |
| Tunnel      | SOCKS5 / WireGuard / OpenVPN öffnen                 | jedes Öffnen erfordert Ihre Zustimmung          |
| Tresor      | Metadaten lesen, neue Geheimnisse speichern         | Geheimnisse verlassen den OpsMaxx-Host nie      |

## Wie es zusammenpasst

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← Benutzer sieht Prompts und genehmigt Schreibvorgänge
│  (muhanai.com)   │
└────────┬─────────┘
         │ OpenAI-kompatibel + MCP
         ▼
┌──────────────────┐  OpsMaxxBridge-Vertrag   ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx Desktop  │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • Genehmigungs-  │
         │                                    │    karte          │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  andere Agenten / andere Maschinen / bot.muhanai.com-Listen
```

## Bedrohungsmodell in einem Absatz

Der gefährlichste Fehlermodus in einem "Browser-Agenten" ist, dass das Modell `DROP TABLE users;` ausführt, ohne dass der Benutzer es sieht. Die Integration behandelt jede Aktion als zu einer von drei Risikoklassen gehörend (`safe` / `needs-approval` / `high-risk-needs-double-approval`), die einmal in der `RISK`-Karte in `packages/opsmaxx-bridge/src/types.ts` deklariert werden. Die MCP-Schicht in `mcp-routes.ts` schlägt die Klasse für jedes Werkzeug nach und leitet es durch die bestehende Human-in-the-Loop-Schranke, bevor es an OpsMaxx weitergeleitet wird. Das Audit-Log zeichnet jeden Aufruf auf, sodass eine Modellentscheidung nachträglich rekonstruiert werden kann.

## Schnellstart (Entwickler)

```bash
# 1. OpsMaxx installieren (kostenlos, MIT, kein Konto)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. SSH/DB/Vault-Einträge hinzufügen, die der Agent verwenden soll
#    Jeder Eintrag erscheint im MuhanAI-Dashboard als "Trusted peer"
#
# 3. MuhanAI agent-daemon lokal ausführen
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## Schnellstart (Endbenutzer)

1. Installieren Sie [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx).
2. Melden Sie sich bei [muhanai.com](https://muhanai.com) an und öffnen Sie die Seite _Trusted peers_ (P2P → OpsMaxx).
3. Koppeln Sie die lokale OpsMaxx-Instanz, indem Sie in der Genehmigungskarte, die in OpsMaxx erscheint, auf "Approve" klicken.
4. Bitten Sie den Agenten um alles, was echte Infrastruktur benötigt. Beobachten Sie die Genehmigungskarten.

## Status der Tracks

- **T1** (Bridge-Vertrag + Mock): abgeschlossen
- **T2** (Vault-Zwei-Wege-Synchronisierung): abgeschlossen
- **T3-A** (sichere MCP-Oberfläche): abgeschlossen
- **T3-B** (MCP-Schreitoberfläche + Audit): in Bearbeitung
- **T4** (P2P-Mesh-Benutzeroberfläche): abgeschlossen
- **T5** (DaedalOS-Integration): abgeschlossen
- **T6** (mehrsprachige Dokumentation): dieses Dokument

## Lizenz

Beide Projekte sind MIT.
