export interface Peer { id: string; address: string; capabilities: string[]; }
export interface PeerTransport { connect(peer: Peer): Promise<void>; disconnect(peerId: string): Promise<void>; }
