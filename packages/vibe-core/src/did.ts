import { getPublicKey } from "@noble/ed25519";
import { HDKey } from "micro-ed25519-hdkey";
import { encode } from "multibase";

export function generateEd25519KeyPair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
} {
    const seed = HDKey.fromMasterSeed(crypto.getRandomValues(new Uint8Array(32))).privateKey;
    const publicKey = getPublicKey(seed);
    return { publicKey, privateKey: seed };
}

export function didFromEd25519(publicKey: Uint8Array): string {
    const didKey = new Uint8Array(2 + publicKey.length);
    didKey[0] = 0xed; // ed25519-pub
    didKey[1] = 0x01;
    didKey.set(publicKey, 2);
    return `did:key:${encode("base58btc", didKey).toString()}`;
}
