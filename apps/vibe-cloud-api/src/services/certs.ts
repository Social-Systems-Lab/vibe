import { IdentityService } from "./identity";
import { DataService, JwtPayload } from "./data";
import * as jose from "jose";
import { publicKeyHexToSpkiPem } from "../lib/did";
import { Certificate, CertType, DocRef, privateKeyHexToPkcs8Pem } from "vibe-core";

export class CertsService {
    constructor(private identityService: IdentityService, private dataService: DataService) {}

    async issueAuto(
        issuer: JwtPayload,
        subjectDid: string,
        certTypeRef: DocRef,
        expires?: string
    ): Promise<Certificate> {
        const user = await this.identityService.findByDid(issuer.sub);
        if (!user) {
            throw new Error("User not found");
        }

        const privateKeyHex = await this.identityService.getDecryptedPrivateKey(user);
        const pkcs8Pem = privateKeyHexToPkcs8Pem(privateKeyHex);
        const privateKey = await jose.importPKCS8(pkcs8Pem, "EdDSA");

        const certId = `issued-certs/${certTypeRef.ref}-${subjectDid}-${Date.now()}`;
        const certPayload = {
            jti: certId,
            type: certTypeRef.ref,
            sub: subjectDid,
            iss: user.did,
            exp: expires ? Math.floor(new Date(expires).getTime() / 1000) : undefined,
        };

        const signature = await new jose.CompactSign(new TextEncoder().encode(JSON.stringify(certPayload)))
            .setProtectedHeader({ alg: "EdDSA" })
            .sign(privateKey);

        const certificate: Certificate = {
            _id: certId,
            type: certTypeRef.ref,
            certType: certTypeRef,
            issuer: user.did,
            subject: subjectDid,
            expires,
            signature,
        };

        return this.issue(certificate, issuer);
    }

    async issue(certificate: Certificate, issuer: JwtPayload): Promise<Certificate> {
        console.log(`Issuing cert from ${issuer.sub} to ${certificate.subject} of type ${certificate.type}`);

        // 1. Verify the certType
        if (!certificate.certType || !certificate.certType.did || !certificate.certType.ref) {
            throw new Error("Certificate must have a valid certType DocRef");
        }

        const certTypeResult = await this.dataService.readOnce(
            "cert-types",
            { _id: certificate.certType.ref },
            { sub: certificate.certType.did, instanceId: "0" }
        );
        if (!certTypeResult || !certTypeResult.docs || certTypeResult.docs.length === 0) {
            throw new Error(
                `Certificate Type ${certificate.certType.ref} not found for did ${certificate.certType.did}`
            );
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
            const subjectCert: Certificate = {
                ...certificate,
                _id: `certs/${certificate.type}-${certificate.issuer}-${Date.now()}`,
            };
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

    async createCertType(owner: JwtPayload, name: string, label: string, description: string): Promise<CertType> {
        const certType: CertType = {
            _id: `cert-types/${owner.sub}/${name}`,
            type: "cert-types",
            owner: owner.sub,
            name,
            label,
            description,
            createdAt: new Date().toISOString(),
        };

        await this.dataService.write("cert-types", certType, owner);

        return certType;
    }
}
