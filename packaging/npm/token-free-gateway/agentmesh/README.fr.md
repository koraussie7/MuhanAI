# Intégration MuhanAI × OpsMaxx — Français (French)

> Ceci est la traduction française de [README.md](../README.md). L'original anglais est toujours la version la plus récente.

## Ce que vous obtenez

La maille d'agents MuhanAI peut maintenant opérer une **infrastructure réelle** en votre nom — et **vos clés API ne quittent jamais votre machine**.

| Capacité         | Ce que l'agent peut faire                                    | Ce qui reste sur votre machine                     |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| SSH              | ouvrir des sessions, exécuter des commandes, suivre les logs | chaque commande nécessite votre approbation        |
| SFTP             | lire et écrire des fichiers                                  | les écritures nécessitent votre approbation        |
| Bases de données | exécuter des SELECT, appliquer des écritures                 | les écritures nécessitent une _double_ approbation |
| Tunnels          | ouvrir SOCKS5 / WireGuard / OpenVPN                          | chaque ouverture nécessite votre approbation       |
| Coffre           | lire les métadonnées, stocker de nouveaux secrets            | les secrets ne quittent jamais l'hôte OpsMaxx      |

## Comment ça s'intègre

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← l'utilisateur voit les prompts et approuve les écritures
│  (muhanai.com)   │
└────────┬─────────┘
         │ Compatible OpenAI + MCP
         ▼
┌──────────────────┐  Contrat OpsMaxxBridge   ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx desktop  │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • carte approb.  │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  autres agents / autres machines / listes bot.muhanai.com
```

## Modèle de menace en un paragraphe

Le mode d'échec le plus dangereux d'un "agent de navigateur" est que le modèle exécute `DROP TABLE users;` à l'insu de l'utilisateur. L'intégration traite chaque action comme appartenant à l'une des trois classes de risque (`safe` / `needs-approval` / `high-risk-needs-double-approval`), déclarées une seule fois dans la carte `RISK` de `packages/opsmaxx-bridge/src/types.ts`. La couche MCP de `mcp-routes.ts` consulte la classe de chaque outil et l'achemine à travers la garde human-in-the-loop existante avant de le transmettre à OpsMaxx. Le journal d'audit enregistre chaque appel, de sorte qu'une décision du modèle peut être reconstituée ultérieurement.

## Démarrage rapide (développeur)

```bash
# 1. Installer OpsMaxx (gratuit, MIT, sans compte)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. Ajouter les entrées SSH/DB/coffre que l'agent pourra utiliser
#    Chaque entrée apparaît dans le tableau de bord MuhanAI comme "Trusted peer"
#
# 3. Exécuter l'agent-daemon MuhanAI localement
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## Démarrage rapide (utilisateur final)

1. Installez [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx).
2. Connectez-vous à [muhanai.com](https://muhanai.com) et ouvrez la page _Trusted peers_ (P2P → OpsMaxx).
3. Appairez l'instance OpsMaxx locale en cliquant sur "Approve" dans la carte d'approbation qui apparaît dans OpsMaxx.
4. Demandez à l'agent tout ce qui nécessite une infrastructure réelle. Surveillez les cartes d'approbation.

## État des pistes

- **T1** (contrat bridge + mock): terminé
- **T2** (synchronisation bidirectionnelle du coffre): terminé
- **T3-A** (surface MCP sûre): terminé
- **T3-B** (surface MCP d'écriture + audit): en cours
- **T4** (UI de maille P2P): terminé
- **T5** (intégration DaedalOS): terminé
- **T6** (documentation multilingue): ce document

## Licence

Les deux projets sont MIT.
