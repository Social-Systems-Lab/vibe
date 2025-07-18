import { IdentityService } from "./identity";
import { DataService, JwtPayload } from "./data";
import { Certificate, CertType } from "vibe-sdk";
import * as jose from "jose";
import { publicKeyHexToSpkiPem } from "../lib/did";

export class CertsService {
    constructor(private identityService: IdentityService, private dataService: DataService) {}

    async issue(certificate: Certificate, issuer: JwtPayload): Promise<Certificate> {
        console.log(`Issuing cert from ${issuer.sub} to ${certificate.subject} of type ${certificate.type}`);

        // 1. Verify the certType
        if (!certificate.certType || !certificate.certType.did || !certificate.certType.ref) {
            throw new Error("Certificate must have a valid certType DocRef");
        }

        const certTypeResult = await this.dataService.readOnce("cert-types", { _id: certificate.certType.ref }, { sub: certificate.certType.did, instanceId: "0" });
        if (!certTypeResult || !certTypeResult.docs || certTypeResult.docs.length === 0) {
            throw new Error(`Certificate Type ${certificate.certType.ref} not found for did ${certificate.certType.did}`);
        }
        const certType = certTypeResult.docs[0] as CertType;
        if (certType.owner !== issuer.sub) {
            throw new Error("Issuer is not the owner of this certificate type");
        }

        // 2. Verify the certificate's signature
        const issuerIdentity = await this.identityService.findByDid(certificate.issuer);
        if (!issuerIdentity) {
            throw new Error("Issuer identity not found");
        }

        const publicKeyPem = publicKeyHexToSpkiPem(issuerIdentity.publicKey);
        const publicKey = await jose.importSPKI(publicKeyPem, "EdDSA");
        try {
            const { payload } = await jose.jwtVerify(certificate.signature, publicKey, {
                issuer: certificate.issuer,
                subject: certificate.subject,
                algorithms: ["EdDSA"],
            });
            console.log("Certificate payload verified:", payload);
        } catch (e) {
            console.error("Invalid certificate signature", e);
            throw new Error("Invalid certificate signature");
        }

        // 3. Store in the issuer's "issued-certs" collection
        await this.dataService.write("issued-certs", certificate, issuer);

        // 4. Remote-write to the subject's "certs" collection
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

    async createCertType(certType: CertType, user: JwtPayload): Promise<any> {
        console.log(`Creating cert type ${certType.name} by ${user.sub}`);
        certType.owner = user.sub;
        if (!certType._id) {
            certType._id = `cert-types/${certType.name}`;
        }
        return this.dataService.write("cert-types", certType, user);
    }

    async getCertType(certTypeId: string, user: JwtPayload): Promise<any> {
        return this.dataService.readOnce("cert-types", { _id: certTypeId }, user);
    }

    async updateCertType(certType: CertType, user: JwtPayload): Promise<any> {
        console.log(`Updating cert type ${certType._id} by ${user.sub}`);
        const existing = await this.dataService.readOnce("cert-types", { _id: certType._id }, user);
        if (!existing || !existing.docs || existing.docs.length === 0) {
            throw new Error("Certificate type not found");
        }
        const existingCertType = existing.docs[0];
        if (existingCertType.owner !== user.sub) {
            throw new Error("User is not the owner of this certificate type");
        }
        return this.dataService.update("cert-types", certType, user);
    }

    async deleteCertType(certTypeId: string, user: JwtPayload): Promise<any> {
        console.log(`Deleting cert type ${certTypeId} by ${user.sub}`);
        const existing = await this.dataService.readOnce("cert-types", { _id: certTypeId }, user);
        if (!existing || !existing.docs || existing.docs.length === 0) {
            throw new Error("Certificate type not found");
        }
        const existingCertType = existing.docs[0];
        if (existingCertType.owner !== user.sub) {
            throw new Error("User is not the owner of this certificate type");
        }
        // Note: This is a soft delete. A hard delete would require a different method in DataService.
        existingCertType._deleted = true;
        return this.dataService.update("cert-types", existingCertType, user);
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
