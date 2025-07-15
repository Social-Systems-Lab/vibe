import { IdentityService } from "./identity";
import { DataService, JwtPayload } from "./data";
import { Certificate } from "vibe-sdk";
import * as jose from "jose";

function privateKeyHexToPkcs8Pem(hexKey: string): string {
    // Ed25519 private keys are 32 bytes. The hex string is 64 characters.
    // The full key pair is 64 bytes, with the private key being the first 32 bytes.
    const privateKeyBytes = Buffer.from(hexKey.slice(0, 64), "hex");

    // The PKCS#8 header for an Ed25519 private key
    const pkcs8Header = Buffer.from("302e020100300506032b657004220420", "hex");

    const pkcs8Key = Buffer.concat([pkcs8Header, privateKeyBytes]);

    const base64Key = pkcs8Key.toString("base64");

    return `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`;
}

export class CertsService {
    constructor(private identityService: IdentityService, private dataService: DataService) {}

    async issue({ type, subject, expires }: { type: string; subject: string; expires?: string }, issuer: JwtPayload): Promise<Certificate> {
        console.log(`Issuing cert from ${issuer.sub} to ${subject} of type ${type}`);

        const issuerIdentity = await this.identityService.findByDid(issuer.sub);
        if (!issuerIdentity) {
            throw new Error("Issuer identity not found");
        }

        // 1. Create the certificate ID first, so it can be included in the payload
        const certId = `issued-certs/${type}-${subject}-${Date.now()}`;

        // 2. Create the certificate payload
        const certPayload = {
            jti: certId, // JWT ID, used for revocation
            type,
            sub: subject,
            iss: issuer.sub,
            exp: expires ? Math.floor(new Date(expires).getTime() / 1000) : undefined,
        };

        // 3. Sign the certificate with the issuer's private key
        const pkcs8Pem = privateKeyHexToPkcs8Pem(issuerIdentity.privateKey);
        const privateKey = await jose.importPKCS8(pkcs8Pem, "ES256");
        const signature = await new jose.CompactSign(new TextEncoder().encode(JSON.stringify(certPayload))).setProtectedHeader({ alg: "ES256" }).sign(privateKey);

        // 4. Create the final certificate document
        const certificate: Certificate = {
            _id: certId,
            type,
            issuer: issuer.sub,
            subject,
            expires,
            signature,
        };

        // 5. Store in the issuer's "issued-certs" collection
        await this.dataService.write("issued-certs", certificate, issuer);

        // 6. Remote-write to the subject's "certs" collection
        const subjectIdentity = await this.identityService.findByDid(subject);
        if (subjectIdentity) {
            const subjectPayload: JwtPayload = { sub: subject, instanceId: subjectIdentity.instanceId };
            // We need to create a new object so we don't modify the original
            const subjectCert: Certificate = { ...certificate, _id: `certs/${type}-${issuer.sub}-${Date.now()}` };
            await this.dataService.write("certs", subjectCert, subjectPayload);
        } else {
            console.warn(`Could not find subject ${subject} to remote-write certificate.`);
        }

        return certificate;
    }

    async revoke(certId: string, issuer: JwtPayload): Promise<any> {
        console.log(`Revoking cert ${certId} by ${issuer.sub}`);

        // For now, we'll just add a document to a 'revocations' collection.
        // This is a simple way to store revocation status.
        // A more robust system might use a different data structure.
        const revocation = {
            _id: `revocations/${certId}`,
            certId,
            revokedAt: new Date().toISOString(),
        };

        return this.dataService.write("revocations", revocation, issuer);
    }
}
