import type { FastifyInstance } from "fastify";
import { hugoMcpFactory, StoreAgentAdapter, type StoreFactoryInput, type FactorySpawnResult } from "@agentmesh/mcp";
import type { AgentRegistry } from "@agentmesh/agent";
import type { AgentDescriptor } from "@agentmesh/core";
import type { IpfsAdapter, DnsLinkAdapter } from "@agentmesh/ipfs";

interface FactoryOptions {
  registry: AgentRegistry;
  ipfs?: IpfsAdapter;
  dnslink?: DnsLinkAdapter;
}

function publicIpfsUrl(subdomain: string, cid: string): string {
  const gateway = process.env.IPFS_GATEWAY_URL?.replace(/\/$/, "");
  return gateway ? `${gateway}/ipfs/${cid}` : `https://${subdomain}.kbizhub.com/ipfs/${cid}`;
}

function factorySiteUrl(subdomain: string): string {
  const origin = process.env.FACTORY_PUBLIC_ORIGIN?.replace(/\/$/, "");
  return `${origin ?? "https://muhanai.com"}/api/factory/sites/${encodeURIComponent(subdomain)}/site/`;
}

function siteBundle(site: FactorySpawnResult): Record<string, string> {
  const store = (site.storeData.store ?? {}) as Record<string, unknown>;
  const menu = (site.storeData.menu ?? {}) as { items?: Array<{ name: string; price: number; description?: string }> };
  return hugoMcpFactory.generateStaticBundle({
    name: typeof store.name === "string" ? store.name : site.subdomain,
    category: typeof store.category === "string" ? store.category : "",
    description: typeof store.description === "string" ? store.description : "",
    subdomain: site.subdomain,
    ...(typeof store.phone === "string" ? { phone: store.phone } : {}),
    ...(typeof store.address === "string" ? { address: store.address } : {}),
    ...(typeof store.hours === "string" ? { hours: store.hours } : {}),
    ...(Array.isArray(menu.items) ? { items: menu.items } : {}),
  });
}

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json") || path.endsWith(".jsonl")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

// In-memory catalog of spawned stores for registry discovery.
// Keep danang-banhmi first for backwards-compatible API ordering; shop1 is the
// new 초원식당 sample node exposed by the Factory page.
const spawnedSites: FactorySpawnResult[] = [
  {
    success: true,
    subdomain: "danang-banhmi",
    cid: "bafybeikbizhubdanangbanhmi01demo",
    websiteUrl: factorySiteUrl("danang-banhmi"),
    mcpUrl: "sse://mcp.muhanai.com/store/danang-banhmi",
    cosmicStarId: "star-store-danang-banhmi",
    manifest: hugoMcpFactory.generateMcpManifest({
      name: "다낭 반미 하우스",
      category: "베트남 음식점",
      description: "바삭한 바게트와 신선한 고수가 들어간 정통 반미 전문점",
      subdomain: "danang-banhmi",
    }),
    storeData: hugoMcpFactory.generateStoreData({
      name: "다낭 반미 하우스",
      category: "베트남 음식점",
      description: "바삭한 바게트와 신선한 고수가 들어간 정통 반미 전문점",
      subdomain: "danang-banhmi",
    }),
    a2uiJsonl: hugoMcpFactory.generateAgentSurface({
      name: "다낭 반미 하우스",
      category: "베트남 음식점",
      description: "바삭한 바게트와 신선한 고수가 들어간 정통 반미 전문점",
      subdomain: "danang-banhmi",
    }, hugoMcpFactory.generateStoreData({
      name: "다낭 반미 하우스",
      category: "베트남 음식점",
      description: "바삭한 바게트와 신선한 고수가 들어간 정통 반미 전문점",
      subdomain: "danang-banhmi",
    }).menu.items).jsonl,
    createdAt: new Date().toISOString(),
  },
  {
    success: true,
    subdomain: "shop1",
    cid: "bafybeikbizhubshop1chowon01demo",
    websiteUrl: factorySiteUrl("shop1"),
    mcpUrl: "sse://mcp.muhanai.com/store/shop1",
    cosmicStarId: "star-store-shop1",
    manifest: hugoMcpFactory.generateMcpManifest({
      name: "초원식당",
      category: "한식당 / Korean Restaurant",
      description: "다낭 안하이의 정통 한식당",
      subdomain: "shop1",
    }),
    storeData: hugoMcpFactory.generateStoreData({
      name: "초원식당",
      category: "한식당 / Korean Restaurant",
      description: "다낭 안하이의 정통 한식당",
      subdomain: "shop1",
      phone: "0936 225 640",
      address: "16 Huy Du, An Hải, Đà Nẵng 550000",
      hours: "매일 영업 · 22:00 마감 (Closes 10 PM)",
      services: ["All you can eat", "Dogs allowed inside", "Wi-Fi"],
      pricePerPerson: "₫100,000–200,000",
    }),
    a2uiJsonl: hugoMcpFactory.generateAgentSurface({
      name: "초원식당",
      category: "한식당 / Korean Restaurant",
      description: "다낭 안하이의 정통 한식당",
      subdomain: "shop1",
      hours: "매일 영업 · 22:00 마감 (Closes 10 PM)",
      services: ["All you can eat", "Dogs allowed inside", "Wi-Fi"],
      pricePerPerson: "₫100,000–200,000",
    }, hugoMcpFactory.generateStoreData({
      name: "초원식당",
      category: "한식당 / Korean Restaurant",
      description: "다낭 안하이의 정통 한식당",
      subdomain: "shop1",
    }).menu.items).jsonl,
    createdAt: new Date().toISOString(),
  },
];

export function createFactoryDescriptor(result: FactorySpawnResult): AgentDescriptor {
  const store = result.storeData?.store;
  const storeName = typeof store === "object" && store !== null
    ? (store as { name?: string }).name
    : undefined;
  return {
    id: `store:${result.subdomain}`,
    name: storeName ?? result.subdomain,
    type: "mcp",
    capabilities: result.manifest.tools.map((t) => t.name),
    cost: 0,
    latencyMs: 1,
    health: { online: true, latency: 1, checkedAt: Date.now() },
  };
}

export async function registerFactoryRoutes(app: FastifyInstance, opts: FactoryOptions) {
  // Register the initial demo store as an agent in the topology
  for (const site of spawnedSites) {
    if (!opts.registry.has(`store:${site.subdomain}`)) {
      opts.registry.register(new StoreAgentAdapter(site));
    }
  }

  // List all spawned stores / business nodes
  app.get("/api/factory/sites", async () => {
    const descriptors = await Promise.all(
      spawnedSites.map(async (site) => {
        const health = opts.registry.healthOf(`store:${site.subdomain}`);
        return {
          ...site,
          agent: {
            id: `store:${site.subdomain}`,
            online: health?.online ?? true,
            latencyMs: health?.latency ?? 1,
          },
        };
      }),
    );
    return {
      total: spawnedSites.length,
      sites: descriptors,
    };
  });

  // Serve the generated storefront directly from the API. This is the
  // deployment-safe fallback when DNSLink, IPFS gateways, or wildcard TLS
  // for *.kbizhub.com are unavailable.
  app.get("/api/factory/sites/:subdomain/site/*", async (request, reply) => {
    const params = request.params as { subdomain: string; "*": string };
    const site = spawnedSites.find((candidate) => candidate.subdomain === params.subdomain);
    if (!site) return reply.code(404).send({ error: "Site not found" });

    const path = params["*"] || "index.html";
    const body = siteBundle(site)[path];
    if (body === undefined) return reply.code(404).send({ error: "Asset not found" });
    return reply.type(contentType(path)).send(body);
  });

  // Get specific store MCP & web details
  app.get<{ Params: { subdomain: string } }>("/api/factory/sites/:subdomain", async (request, reply) => {
    const site = spawnedSites.find((s) => s.subdomain === request.params.subdomain);
    if (!site) {
      return reply.code(404).send({ error: "Site not found" });
    }
    return site;
  });

  // 1-Click Spawn API
  app.post<{ Body: StoreFactoryInput }>("/api/factory/spawn", async (request, reply) => {
    const body = request.body as StoreFactoryInput | undefined;
    if (!body || !body.name || !body.subdomain) {
      return reply.code(400).send({
        error: "name and subdomain are required to spawn a node",
      });
    }

    const cleanSubdomain = body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const result = await hugoMcpFactory.spawn({
      ...body,
      subdomain: cleanSubdomain,
    });

    // Real-IPFS path: upload the bundle, replace the simulated CID with the
    // root CID the daemon returns. Falls back silently to the simulated CID
    // when the adapter is the mock or when the daemon is unreachable.
    if (opts.ipfs) {
      try {
        const bundle = hugoMcpFactory.generateStaticBundle({ ...body, subdomain: cleanSubdomain });
        const { cid, size } = await opts.ipfs.add(bundle);
        result.cid = cid;
        // A DNSLink TXT record only works when the hostname is backed by an
        // IPFS-aware gateway. Use the configured gateway as the canonical URL
        // unless the deployment explicitly provides one for kbizhub.com.
        result.websiteUrl = publicIpfsUrl(cleanSubdomain, cid);
        app.log.info(
          { subdomain: cleanSubdomain, cid, size },
          "uploaded bundle to IPFS",
        );
      } catch (err) {
        result.websiteUrl = factorySiteUrl(cleanSubdomain);
        app.log.warn(
          { err, subdomain: cleanSubdomain },
          "IPFS add failed (serving generated site from API)",
        );
      }
    } else {
      result.websiteUrl = factorySiteUrl(cleanSubdomain);
    }

    // Save to catalog
    spawnedSites.unshift(result);

    // Register as an agent in the cosmic topology so the network
    // stats, /api/agents, and /api/events all reflect the new node.
    if (!opts.registry.has(`store:${cleanSubdomain}`)) {
      opts.registry.register(new StoreAgentAdapter(result));
    }

    // Pin to IPFS and update DNSLink if adapters are configured
    if (opts.ipfs) {
      try {
        await opts.ipfs.pin(result.cid, { replication: 3 });
        app.log.info({ subdomain: cleanSubdomain, cid: result.cid }, "pinned to IPFS");
      } catch (err) {
        app.log.warn({ err, cid: result.cid }, "IPFS pin failed (using simulated CID)");
      }
    }
    if (opts.dnslink) {
      try {
        await opts.dnslink.updateDnsLink(cleanSubdomain, result.cid);
        app.log.info({ subdomain: cleanSubdomain, cid: result.cid }, "DNSLink updated");
      } catch (err) {
        app.log.warn({ err, subdomain: cleanSubdomain }, "DNSLink update failed (using simulated endpoint)");
      }
    }

    app.log.info({ subdomain: cleanSubdomain, cid: result.cid }, "spawned new Hugo + MCP node");
    return result;
  });

  // Rollback DNSLink to a previous CID (Phase 4)
  app.post<{ Params: { subdomain: string }; Body: { previousCid?: string } }>(
    "/api/factory/sites/:subdomain/rollback",
    async (request, reply) => {
      const { subdomain } = request.params;
      const site = spawnedSites.find((s) => s.subdomain === subdomain);
      if (!site) {
        return reply.code(404).send({ error: "Site not found" });
      }
      const previousCid = request.body?.previousCid;
      if (!previousCid) {
        return reply.code(400).send({ error: "previousCid is required for rollback" });
      }
      if (opts.dnslink) {
        try {
          await opts.dnslink.rollbackDnsLink(subdomain, previousCid);
        } catch (err) {
          app.log.warn({ err, subdomain }, "DNSLink rollback failed");
        }
      }
      return { success: true, subdomain, rolledBackToCid: previousCid };
    },
  );

  // Serve the .well-known/mcp.json directly for agents
  app.get<{ Params: { subdomain: string } }>("/api/factory/mcp/:subdomain", async (request, reply) => {
    const site = spawnedSites.find((s) => s.subdomain === request.params.subdomain);
    if (!site) {
      return reply.code(404).send({ error: "MCP not found for subdomain" });
    }
    return site.manifest;
  });

  // Topology for the Cosmic Canvas — includes spawned store agents
  app.get("/api/factory/topology", async () => {
    const topology = await opts.registry.topology();
    // Enrich topology agents with store-specific cosmic data
    const enrichedAgents = topology.agents.map((agent) => {
      const site = spawnedSites.find((s) => s.subdomain === agent.id.replace(/^store:/, ""));
      if (site) {
        return {
          ...agent,
          cosmicStarId: site.cosmicStarId,
          websiteUrl: site.websiteUrl,
          mcpUrl: site.mcpUrl,
        };
      }
      return agent;
    });
    return {
      agents: enrichedAgents,
      connections: topology.connections,
    };
  });
}
