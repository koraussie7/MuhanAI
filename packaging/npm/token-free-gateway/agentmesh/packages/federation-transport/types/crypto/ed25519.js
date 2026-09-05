import { webcrypto } from "node:crypto";
export async function generateKeyPair() {
    const keyPair = await webcrypto.subtle.generateKey({
        name: "ECDSA",
        namedCurve: "P-256",
    }, true, ["sign", "verify"]);
    const publicKeyBuffer = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKeyBuffer = await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    return {
        publicKey: bufferToHex(publicKeyBuffer),
        privateKey: bufferToHex(privateKeyBuffer),
    };
}
export async function sign(data, privateKeyHex) {
    const privateKeyBuffer = hexToBuffer(privateKeyHex);
    const privateKey = await webcrypto.subtle.importKey("pkcs8", privateKeyBuffer, {
        name: "ECDSA",
        namedCurve: "P-256",
    }, false, ["sign"]);
    const encoder = new TextEncoder();
    const signature = await webcrypto.subtle.sign({
        name: "ECDSA",
        hash: "SHA-256",
    }, privateKey, encoder.encode(data));
    return bufferToHex(signature);
}
export async function verify(data, signatureHex, publicKeyHex) {
    try {
        const publicKeyBuffer = hexToBuffer(publicKeyHex);
        const publicKey = await webcrypto.subtle.importKey("spki", publicKeyBuffer, {
            name: "ECDSA",
            namedCurve: "P-256",
        }, false, ["verify"]);
        const encoder = new TextEncoder();
        const signatureBuffer = hexToBuffer(signatureHex);
        return webcrypto.subtle.verify({
            name: "ECDSA",
            hash: "SHA-256",
        }, publicKey, signatureBuffer, encoder.encode(data));
    }
    catch {
        return false;
    }
}
export function computeFingerprint(publicKeyHex) {
    const buffer = hexToBuffer(publicKeyHex);
    const hash = new Uint8Array(buffer);
    return bufferToHex(hash.slice(0, 16));
}
function bufferToHex(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
function hexToBuffer(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    return bytes.buffer;
}
//# sourceMappingURL=ed25519.js.map