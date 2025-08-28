import type { JwtPayload } from "../services/data";
import type { IdentityService } from "../services/identity";
import type { DataService } from "../services/data";
import { publicKeyHexToSpkiPem } from "vibe-core";
import * as jose from "jose";

/**
 * ACL evaluator wired to existing certificate-based rules and app consent.
 *
 * Behavior summary:
 * - Caller must already enforce tenant isolation via storageKey prefix.
 * - If fileDoc.instanceId is present and mismatches requester.instanceId -> deny.
 * - If fileDoc.instanceId matches requester.instanceId -> allow (in-tenant read).
 * - If acl.visibility === "public" -> allow (no consent required).
 * - If no ACL -> owner-only (ownerDid/did/createdByDid must match requester.sub).
 * - Else evaluate ACL:
 *    - Deny rules are checked first; if match -> deny
 *    - Allow rules: "*" or DID string or { issuer, type } matched by a verified cert
 *    - If allow matched and an appIdOrOrigin is provided, require user consent for that origin/app -> else deny
 */

export type AllowReadOptions = {
  appIdOrOrigin?: string;
  services?: {
    identityService: IdentityService;
    dataService: DataService;
  };
};

type AclRule =
  | string
  | {
      issuer: string;
      type: string;
    };

type AclPermission = {
  allow?: (AclRule | AclRule[])[];
  deny?: (AclRule | AclRule[])[];
};

type Acl = {
  visibility?: "public" | "private";
  read?: AclPermission;
  write?: AclPermission;
  create?: AclPermission;
};

type CertJwtPayload = jose.JWTPayload & {
  jti?: string;
  type?: string;
  sub?: string;
  iss?: string;
};

type VerifiedCert = {
  payload: CertJwtPayload;
  raw: string;
};

export async function allowRead(
  requester: Pick<JwtPayload, "sub" | "instanceId">,
  fileDoc: any,
  opts?: AllowReadOptions
): Promise<boolean> {
  // Extra safeguard: if the document has an instanceId, it must match
  if (fileDoc?.instanceId && fileDoc.instanceId !== requester.instanceId) {
    return false;
  }

  // In-tenant optimization: same-tenant documents are readable
  if (fileDoc?.instanceId && fileDoc.instanceId === requester.instanceId) {
    return true;
  }

  const acl: Acl | undefined = fileDoc?.acl;

  // Public visibility shortcut
  if (acl && typeof acl === "object" && acl.visibility === "public") {
    return true;
  }

  // Owner-only if no ACL
  const ownerDid = fileDoc?.ownerDid || fileDoc?.did || fileDoc?.createdByDid;
  const hasAcl = !!(acl && typeof acl === "object" && Object.keys(acl as Record<string, unknown>).length > 0);
  if (!hasAcl) {
    return !!ownerDid && ownerDid === requester.sub;
  }

  // Evaluate ACL rules
  const readPerm = acl?.read;
  if (!readPerm) {
    // No explicit read rules -> default deny (unless owner)
    return !!ownerDid && ownerDid === requester.sub;
  }

  const verifiedCerts = opts?.services
    ? await verifyAndDecodeCertsForUser(requester.sub, opts.services.identityService, opts.services.dataService)
    : [];

  // Deny first
  if (readPerm.deny && checkAcl(readPerm.deny, requester.sub, verifiedCerts)) {
    return false;
  }

  // Allow if any allow rule matches
  let allowed = false;
  if (readPerm.allow && checkAcl(readPerm.allow, requester.sub, verifiedCerts)) {
    allowed = true;
  }

  // Owner shortcut if not explicitly denied
  if (!allowed && ownerDid === requester.sub) {
    allowed = true;
  }

  if (!allowed) return false;

  // If an app context is provided, require consent
  if (opts?.appIdOrOrigin && opts.services) {
    const consented = await opts.services.identityService.hasUserConsented(requester.sub, opts.appIdOrOrigin);
    if (!consented) return false;
  }

  return true;
}

/**
 * Simple tenant isolation guard: require storageKey to start with the caller's instanceId prefix.
 * Returns true if formatted as "u/{instanceId}/...".
 */
export function isKeyInInstance(storageKey: string, instanceId: string): boolean {
  return typeof storageKey === "string" && storageKey.startsWith(`u/${instanceId}/`);
}

function checkAcl(rules: (AclRule | AclRule[])[], userDid: string, verifiedCerts: VerifiedCert[]): boolean {
  return rules.some((rule) => {
    if (Array.isArray(rule)) {
      // AND across subrules
      return rule.every((r) => matchRule(r, userDid, verifiedCerts));
    }
    // OR across top-level rules
    return matchRule(rule, userDid, verifiedCerts);
  });
}

function matchRule(rule: AclRule, userDid: string, verifiedCerts: VerifiedCert[]): boolean {
  if (typeof rule === "string") {
    if (rule === "*") return true;
    return rule === userDid;
  }
  // Certificate-based rule
  return verifiedCerts.some(
    (c) => c.payload.sub === userDid && c.payload.iss === rule.issuer && c.payload.type === rule.type
  );
}

async function verifyAndDecodeCertsForUser(
  userDid: string,
  identityService: IdentityService,
  dataService: DataService
): Promise<VerifiedCert[]> {
  try {
    const user = await identityService.findByDid(userDid);
    if (!user) return [];
    const userCerts = await dataService.getUserCertificates(user.instanceId);
    const signatures: string[] = userCerts.map((c: any) => c.signature).filter(Boolean);

    const verified: VerifiedCert[] = [];
    for (const sig of signatures) {
      try {
        const payload = jose.decodeJwt(sig) as CertJwtPayload;
        const iss = payload.iss;
        if (!iss) continue;

        const issuer = await identityService.findByDid(iss);
        if (!issuer) continue;

        const spkiPem = publicKeyHexToSpkiPem(issuer.publicKey);
        const publicKey = await jose.importSPKI(spkiPem, "EdDSA");
        await jose.compactVerify(sig, publicKey);

        if (payload.exp && payload.exp < Date.now() / 1000) {
          continue;
        }

        // Check revocation in issuer's DB
        try {
          if (payload.jti) {
            const issuerDb = dataService.getDb(issuer.instanceId);
            await issuerDb.get(`revocations/${payload.jti}`);
            // If found, it's revoked -> skip
            continue;
          }
        } catch (e: any) {
          // 404 means not revoked, anything else rethrow
          if (e?.statusCode && e.statusCode !== 404) {
            // Non-404 error while checking revocation -> treat as unverifiable
            continue;
          }
        }

        verified.push({ payload, raw: sig });
      } catch {
        // Skip invalid certs
      }
    }
    return verified;
  } catch {
    return [];
  }
}
