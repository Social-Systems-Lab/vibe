import { IdentityService } from "./identity";
import { DataService, JwtPayload } from "./data";
import { Certificate } from "vibe-sdk";
import * as jose from "jose";

export class CertsService {
    constructor(private identityService: IdentityService, private dataService: DataService) {}

    async issue(certificate: Certificate, issuer: JwtPayload): Promise<Certificate> {
        console.log(`Issuing cert from ${issuer.sub} to ${certificate.subject} of type ${certificate.type}`);

        // 1. Verify the certificate's signature
        const issuerIdentity = await this.identityService.findByDid(certificate.issuer);
        if (!issuerIdentity) {
            throw new Error("Issuer identity not found");
        }

        const publicKey = await jose.importSPKI(issuerIdentity.publicKey, "ES256");
        try {
            await jose.compactVerify(certificate.signature, publicKey);
        } catch (e) {
            throw new Error("Invalid certificate signature");
        }

        // 2. Store in the issuer's "issued-certs" collection
        await this.dataService.write("issued-certs", certificate, issuer);

        // 3. Remote-write to the subject's "certs" collection
        const subjectIdentity = await this.identityService.findByDid(certificate.subject);
        if (subjectIdentity) {
            const subjectPayload: JwtPayload = { sub: certificate.subject, instanceId: subjectIdentity.instanceId };
            const subjectCert: Certificate = { ...certificate, _id: `certs/${certificate.type}-${certificate.issuer}-${Date.now()}` };
            await this.dataService.write("certs", subjectCert, subjectPayload);
        } else {
            console.warn(`Could not find subject ${certificate.subject} to remote-write certificate.`);
        }

        return certificate;
    }

    async revoke(certId: string, issuer: JwtPayload): Promise<any> {
        console.log(`Revoking cert ${certId} by ${issuer.sub}`);

        const revocation = {
            _id: `revocations/${certId}`,
            certId,
            revokedAt: new Date().toISOString(),
        };

        return this.dataService.write("revocations", revocation, issuer);
    }
}
