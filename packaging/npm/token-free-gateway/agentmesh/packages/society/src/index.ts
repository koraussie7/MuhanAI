/**
 * @agentmesh/society — Society Protocol integration bridge.
 *
 * Wraps the `society-protocol` npm package and adapts it to AgentMesh:
 *   - SocietyTransport  -> PeerTransport (protocol: "libp2p")
 *   - SocietyKnowledge  -> CRDT knowledge pool over society
 *   - connectSocietyMesh -> typed client factory
 *
 * Node.js >= 20 only. Do NOT import from Cloudflare Workers / browser.
 */

export {
  connectSocietyMesh,
  createClient,
  society,
  type SocietyMeshConfig,
  type SocietyClient,
  type SDKConfig,
  type PeerInfo,
} from "./society-client.js";

export { SocietyTransport, type SocietyTransportOptions } from "./society-transport.js";
export { SocietyKnowledge, type SocietyKnowledgeOptions } from "./society-knowledge.js";
