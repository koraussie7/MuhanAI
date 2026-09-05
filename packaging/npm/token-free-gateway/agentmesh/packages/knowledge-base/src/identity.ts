import type { SignedRecord } from "@agentmesh/shared";
import { generateKeyPair, sign, verify, computeFingerprint } from "@agentmesh/federation-transport";

export interface Identity {
  peerId: string;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

export class IdentityService {
  private identities = new Map<string, Identity>();

  async createIdentity(peerId: string): Promise<Identity> {
    const keyPair = await generateKeyPair();
    const identity: Identity = {
      peerId,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      fingerprint: computeFingerprint(keyPair.publicKey),
    };
    this.identities.set(peerId, identity);
    return identity;
  }

  getIdentity(peerId: string): Identity | undefined {
    return this.identities.get(peerId);
  }

  getAll(): Identity[] {
    return Array.from(this.identities.values());
  }

  async signRecord(peerId: string, record: Omit<SignedRecord, "signature" | "publicKey" | "peerId" | "timestamp" | "vectorClock">): Promise<SignedRecord> {
    const identity = this.identities.get(peerId);
    if (!identity) {
      throw new Error(`Identity not found for peer: ${peerId}`);
    }

    const payload = JSON.stringify({
      id: record.id,
      content: record.content,
      type: record.type,
      ownerId: record.ownerId,
    });

    const signature = await sign(payload, identity.privateKey);

    return {
      ...record,
      peerId,
      publicKey: identity.publicKey,
      signature,
      timestamp: Date.now(),
      vectorClock: {},
    };
  }

  async verifyRecord(record: SignedRecord): Promise<boolean> {
    const payload = JSON.stringify({
      id: record.id,
      content: record.content,
      type: record.type,
      ownerId: record.ownerId,
    });

    return verify(payload, record.signature, record.publicKey);
  }
}

export const identityService = new IdentityService();
