export interface KeyPair {
    publicKey: string;
    privateKey: string;
}
export declare function generateKeyPair(): Promise<KeyPair>;
export declare function sign(data: string, privateKeyHex: string): Promise<string>;
export declare function verify(data: string, signatureHex: string, publicKeyHex: string): Promise<boolean>;
export declare function computeFingerprint(publicKeyHex: string): string;
//# sourceMappingURL=ed25519.d.ts.map