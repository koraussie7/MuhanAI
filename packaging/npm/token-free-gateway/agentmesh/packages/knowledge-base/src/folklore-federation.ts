import type { SignedRecord, FederationNode, FederationSyncResult } from "@agentmesh/shared";

export interface Transport {
  start(): Promise<void>;
  stop(): Promise<void>;
  query(peerId: string, query: string, embedding?: number[]): Promise<SignedRecord[]>;
  push(peerId: string, records: SignedRecord[]): Promise<number>;
  getPeers(): Array<{ peerId: string; address: string; online: boolean }>;
  addPeer(address: string): Promise<void>;
  removePeer(peerId: string): Promise<void>;
}

export interface EnergyGateOptions {
  temperature?: number;
  minHits?: number;
  admitThreshold?: number;
}

export class EnergyGate {
  private readonly temperature: number;
  private readonly minHits: number;
  private readonly admitThreshold: number;

  constructor(options: EnergyGateOptions = {}) {
    this.temperature = options.temperature ?? 0.2;
    this.minHits = options.minHits ?? 2;
    this.admitThreshold = options.admitThreshold ?? 0.75;
  }

  score(queryEmbedding: number[], hits: Array<{ embedding: number[]; score: number }>): number {
    if (hits.length < this.minHits) return -Infinity;

    const similarities = hits.map((h) => h.score);
    const maxSim = Math.max(...similarities);
    const logSumExp = this.logSumExp(similarities.map((s) => s / this.temperature));
    const energy = -this.temperature * logSumExp;

    const normalized = 1 / (1 + Math.exp(-energy + maxSim));
    return Number.isFinite(normalized) ? normalized : 0;
  }

  shouldAdmit(queryEmbedding: number[], hits: Array<{ embedding: number[]; score: number }>): boolean {
    if (hits.length === 0) return false;
    const score = this.score(queryEmbedding, hits);
    return score >= this.admitThreshold;
  }

  private logSumExp(values: number[]): number {
    if (values.length === 0) return -Infinity;
    const max = Math.max(...values);
    const sum = values.reduce((acc, v) => acc + Math.exp(v - max), 0);
    return max + Math.log(sum);
  }
}

export interface ProvenanceRankerOptions {
  poisonFlipBudget?: number;
  minTrust?: number;
}

export class ProvenanceRanker {
  private readonly poisonFlipBudget: number;
  private readonly minTrust: number;

  constructor(options: ProvenanceRankerOptions = {}) {
    this.poisonFlipBudget = options.poisonFlipBudget ?? 0.02;
    this.minTrust = options.minTrust ?? 0.3;
  }

  rank(records: SignedRecord[], queryEmbedding: number[]): SignedRecord[] {
    const scored = records.map((record) => {
      const trust = this.computeTrust(record);
      const provenanceScore = this.provenanceScore(record);
      const semanticScore = this.semanticSimilarity(queryEmbedding, record);
      return { record, trust, provenanceScore, semanticScore };
    });

    const filtered = scored.filter((s) => s.trust >= this.minTrust);

    const ranked = filtered
      .map((s) => ({
        record: s.record,
        score: 0.5 * s.provenanceScore + 0.3 * s.trust + 0.2 * s.semanticScore,
      }))
      .filter((s) => s.score < this.poisonFlipBudget)
      .sort((a, b) => b.score - a.score);

    return ranked.map((s) => s.record);
  }

  private computeTrust(record: SignedRecord): number {
    const ageMs = Date.now() - record.timestamp;
    const freshness = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
    const sourceCount = (record.sources?.length ?? 0);
    const sourceBonus = Math.min(1, sourceCount / 5);
    return 0.6 * freshness + 0.4 * sourceBonus;
  }

  private provenanceScore(record: SignedRecord): number {
    const hasSignature = Boolean(record.signature && record.publicKey);
    const hasVectorClock = Object.keys(record.vectorClock).length > 0;
    const hasSources = (record.sources?.length ?? 0) > 0;
    return (hasSignature ? 0.5 : 0) + (hasVectorClock ? 0.3 : 0) + (hasSources ? 0.2 : 0);
  }

  private semanticSimilarity(queryEmbedding: number[], record: SignedRecord): number {
    const text = `${record.content} ${record.type}`;
    const words = text.toLowerCase().split(/\s+/).slice(0, 20);
    const queryWords = queryEmbedding.slice(0, words.length);
    const overlap = words.filter((_, i) => (queryWords[i] ?? 0) > 0.5).length;
    return queryWords.length > 0 ? overlap / queryWords.length : 0;
  }
}

export interface FederationMeshOptions {
  peerId: string;
  bootstrap?: string[];
  energyGate?: EnergyGateOptions;
  provenanceRanker?: ProvenanceRankerOptions;
  transport?: Transport;
}

export class FederationMesh {
  private readonly peers = new Map<string, FederationNode>();
  private readonly localRecords = new Map<string, SignedRecord>();
  private readonly energyGate: EnergyGate;
  private readonly provenanceRanker: ProvenanceRanker;
  private readonly peerId: string;
  private readonly transport: Transport;

  constructor(options: FederationMeshOptions) {
    this.peerId = options.peerId;
    this.energyGate = new EnergyGate(options.energyGate);
    this.provenanceRanker = new ProvenanceRanker(options.provenanceRanker);
    this.transport = options.transport ?? {
      start: async () => {},
      stop: async () => {},
      query: async () => [],
      push: async () => 0,
      getPeers: () => [],
      addPeer: async () => {},
      removePeer: async () => {},
    } as Transport;

    for (const bootstrap of options.bootstrap ?? []) {
      this.addPeer({
        peerId: bootstrap,
        address: bootstrap,
        lastSeen: Date.now(),
        capabilities: [],
        reputation: 0,
        online: false,
      });
    }
  }

  addPeer(node: FederationNode): void {
    this.peers.set(node.peerId, { ...node, lastSeen: Date.now() });
  }

  removePeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  ingest(record: SignedRecord): void {
    this.localRecords.set(record.id, record);
  }

  async query(queryEmbedding: number[], queryText: string): Promise<SignedRecord[]> {
    const local = this.provenanceRanker.rank(Array.from(this.localRecords.values()), queryEmbedding);

    const federated = await this.federatedFanOut(queryText, queryEmbedding);
    const combined = this.mergeResults(local, federated);

    const hits = combined.map((record) => ({
      embedding: this.textToEmbedding(record.content),
      score: this.semanticScore(queryEmbedding, record.content),
      record,
    }));

    const admitted = hits.filter((hit) => this.energyGate.shouldAdmit(queryEmbedding, hits));

    return admitted.sort((a, b) => b.score - a.score).map((h) => h.record);
  }

  async sync(): Promise<FederationSyncResult> {
    let pulled = 0;
    let pushed = 0;

    for (const [peerId, peer] of this.peers) {
      if (!peer.online) continue;

      try {
        const remote = await this.transport.query(peerId, "");
        pulled += remote.length;

        const pushedCount = await this.transport.push(peerId, Array.from(this.localRecords.values()));
        pushed += pushedCount;

        peer.lastSeen = Date.now();
        peer.reputation = Math.min(1, peer.reputation + 0.01);
      } catch {
        peer.reputation = Math.max(0, peer.reputation - 0.05);
      }
    }

    return {
      pulled,
      pushed,
      peers: Array.from(this.peers.values()),
    };
  }

  getPeers(): FederationNode[] {
    return Array.from(this.peers.values());
  }

  getLocalRecords(): SignedRecord[] {
    return Array.from(this.localRecords.values());
  }

  private async federatedFanOut(queryText: string, embedding: number[]): Promise<SignedRecord[]> {
    const results: SignedRecord[] = [];
    for (const peer of this.peers.values()) {
      if (!peer.online) continue;
      const remote = await this.transport.query(peer.peerId, queryText, embedding);
      results.push(...remote);
    }
    return results;
  }

  private mergeResults(local: SignedRecord[], federated: SignedRecord[]): SignedRecord[] {
    const seen = new Set(local.map((r) => r.id));
    const merged = [...local];
    for (const record of federated) {
      if (!seen.has(record.id)) {
        merged.push(record);
        seen.add(record.id);
      }
    }
    return merged;
  }

  private textToEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0);
    for (let i = 0; i < words.length && i < embedding.length; i++) {
      const word = words[i] ?? "";
      embedding[i] = Math.sin(word.length) * Math.cos(i);
    }
    return embedding;
  }

  private semanticScore(queryEmbedding: number[], text: string): number {
    const embedding = this.textToEmbedding(text);
    const dot = queryEmbedding.reduce((sum, q, i) => sum + q * (embedding[i] ?? 0), 0);
    const magA = Math.sqrt(queryEmbedding.reduce((sum, q) => sum + q * q, 0)) || 1;
    const magB = Math.sqrt(embedding.reduce((sum, e) => sum + e * e, 0)) || 1;
    return dot / (magA * magB);
  }
}
