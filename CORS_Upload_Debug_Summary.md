# Technical Summary: Debugging Persistent CORS Error on Scaleway S3 Upload

## 1. Problem Summary

An image upload feature is failing in production. The user selects a file in a web UI, and the browser attempts to `PUT` the file directly to a presigned URL for a Scaleway S3-compatible Object Storage bucket. This request fails with a CORS preflight error. The core error message from the browser console is:

```
Access to fetch at '...' from origin 'https://api.vibepublic.com' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

This error persists despite the S3 bucket's CORS policy being correctly configured to allow the origin.

---

## 2. System Architecture

-   **Frontend:** A Next.js application served from `https://api.vibepublic.com`. The specific component is an authentication/profile wizard.
-   **Backend API:** An ElysiaJS (`vibe-cloud-api`) application, also served from `https://api.vibepublic.com`, is responsible for generating the presigned URL.
-   **Infrastructure:** Hosted on Scaleway.
    -   **Compute:** Kapsule (Managed Kubernetes)
    -   **Storage:** Object Storage (S3-compatible)
-   **Infrastructure as Code (IaC):** Terraform manages the Scaleway resources.
-   **CI/CD:** GitHub Actions automates Terraform and application deployments.

---

## 3. Debugging Timeline & Key Findings

### Step 1: Initial `TypeError`

The first reported error was a `TypeError` in the API, caused by a missing `https://` protocol prefix in the S3 endpoint URL. This was resolved.

### Step 2: First CORS Error & Terraform Drift

After fixing the `TypeError`, the first CORS error appeared. This led to the discovery that the S3 bucket had no CORS policy. Attempting to apply one via Terraform revealed that the production infrastructure had significant "state drift" from the remote Terraform state file.

A lengthy process was undertaken to bring the infrastructure back in sync with the state file, which involved:

-   Fixing the GitHub Actions `apply-terraform` workflow.
-   Using `terraform import` to bring the existing Kapsule cluster and S3 bucket into the state.
-   Recreating the Kubernetes node pool under Terraform management.
-   This process successfully concluded with the infrastructure being fully managed by Terraform.

### Step 3: Applying the CORS Policy

The following CORS policy was added to the `scaleway_object_bucket` resource in Terraform and successfully applied via the CI/CD pipeline.

**File: `infra/terraform/main.tf`**

```terraform
resource "scaleway_object_bucket" "vibe_bucket" {
  name = "vibe-user-storage"
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "POST", "PUT", "DELETE"]
    allowed_origins = ["https://*.vibepublic.com", "https://*.vibe-feeds.vercel.app", "https://api.vibepublic.com"]
    max_age_seconds = 3000
    expose_headers  = ["Etag"]
  }
}
```

### Step 4: Verification of Active CORS Policy

Using the AWS CLI configured for the Scaleway endpoint, we confirmed that the policy **is active on the bucket in production**.

**Command:**

```bash
aws s3api get-bucket-cors --bucket vibe-user-storage --endpoint-url https://s3.fr-par.scw.cloud
```

**Output:**

```json
{
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "HEAD", "POST", "PUT", "DELETE"],
            "AllowedOrigins": ["https://*.vibepublic.com", "https://*.vibe-feeds.vercel.app", "https://api.vibepublic.com"],
            "ExposeHeaders": ["Etag"],
            "MaxAgeSeconds": 3000
        }
    ]
}
```

This proves the infrastructure configuration is correct.

### Step 5: Signature Mismatch Hypothesis

The investigation then focused on a potential signature mismatch. A user-provided article suggested that for Scaleway, any headers included when generating the presigned URL (like `ACL: 'public-read'`) **must** also be sent by the client in the `PUT` request.

Our code was generating the signature with `ACL: 'public-read'` on the server but was not sending the corresponding `x-amz-acl: 'public-read'` header from the client.

### Step 6: The Final (Failed) Fix

A fix was implemented in the API to pass the required header to the client, so it could be included in the upload request.

**File: `apps/vibe-cloud-api/src/services/storage.ts` (After the fix)**

```typescript
// ... inside ScalewayStorageProvider class
async presignPut(bucket: string, key: string, contentType?: string, expiresSeconds = 300): Promise<PresignPutResult> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
        const cmd = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
            ACL: "public-read",
        });
        const signedUrl: string = await getSignedUrl(this.client as any, cmd as any, { expiresIn: expiresSeconds });

        const headers: Record<string, string> = { "x-amz-acl": "public-read" };
        if (contentType) {
            headers["Content-Type"] = contentType;
        }
        return {
            bucket,
            key,
            url: signedUrl,
            headers,
            strategy: "presigned",
        };
    } catch {
        return { bucket, key, strategy: "server-upload" };
    }
}
```

The client-side code correctly uses these headers:

**File: `apps/vibe-cloud-ui/app/auth/wizard/page.tsx`**

```typescript
// ... inside handleSubmit function
const uploadResponse = await fetch(plan.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type, ...plan.headers },
});
```

**Despite this fix being deployed, the error persists.**

---

## 4. Current State & The Core Unresolved Problem

The preflight `OPTIONS` request sent by the browser is still failing with a `403 Forbidden` and no `Access-Control-Allow-Origin` header in the response.

### Failed Request Headers (`OPTIONS`)

-   **Request URL:** (A very long presigned URL, see below)
-   **Request Method:** `OPTIONS`
-   **Status Code:** `403 Forbidden`
-   **Remote Address:** `51.159.62.20:443`

**Request Headers Sent by Browser:**

```
:authority: user-4a3uzddq7xqnfocwq-m2qquhr.s3.fr-par.scw.cloud
:method: OPTIONS
:path: /2025/08/42fe5bb... (full path with signature)
:scheme: https
accept: */*
accept-encoding: gzip, deflate, br, zstd
accept-language: sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7
access-control-request-headers: content-type,x-amz-acl  <-- Note: Browser now correctly asks for x-amz-acl
access-control-request-method: PUT
origin: https://api.vibepublic.com
priority: u=1, i
referer: https://api.vibepublic.com/
sec-fetch-dest: empty
sec-fetch-mode: cors
sec-fetch-site: cross-site
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36
```

**Response Headers from Server:**

```
content-length: 252
content-type: application/xml
date: Wed, 13 Aug 2025 19:56:19 GMT
x-amz-id-2: txgca0374b8a14f47f6b611-00689cede3
x-amz-request-id: txgca0374b8a14f47f6b611-00689cede3
```

**Crucially, the `Access-Control-Allow-Origin` header is missing from the response, which is the direct cause of the browser error.**

---

## 5. Core Unanswered Questions

1.  **Why is the `OPTIONS` preflight request failing with a 403?** The bucket's CORS policy is verified to be correct and explicitly allows the origin, the `PUT` method, and all headers (`*`).
2.  **Is there a different/undocumented expectation from Scaleway for preflight requests to presigned URLs?** The `403 Forbidden` suggests an authentication/authorization issue, which is strange for a preflight request that should be anonymous.
3.  **Does the signature in the URL query string somehow invalidate the preflight request?** Preflight requests are supposed to be sent _without_ credentials, but the signature is part of the URL. Could this be the source of the conflict?

This document contains all known information about the issue.

---

Headers from the latest test:

Request URL
https://user-4a3uzddq7xqnfocwq-m2qquhr.s3.fr-par.scw.cloud/2025/08/a7ae32cd-0b02-4bee-97c7-556a7c3a5718.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=SCW53B4XGWQNEWBD5J9D%2F20250813%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20250813T200933Z&X-Amz-Expires=300&X-Amz-Signature=2ed22eb4b6d69747790122471e108751e8594b86abbddac6974d84e1611d737e&X-Amz-SignedHeaders=host&x-amz-acl=public-read&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject
Referrer Policy
strict-origin-when-cross-origin
content-type
image/png
referer
https://api.vibepublic.com/
sec-ch-ua
"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"
sec-ch-ua-mobile
?0
sec-ch-ua-platform
"Windows"
user-agent
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36
x-amz-acl
public-read

Request URL
https://user-4a3uzddq7xqnfocwq-m2qquhr.s3.fr-par.scw.cloud/2025/08/a7ae32cd-0b02-4bee-97c7-556a7c3a5718.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=SCW53B4XGWQNEWBD5J9D%2F20250813%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20250813T200933Z&X-Amz-Expires=300&X-Amz-Signature=2ed22eb4b6d69747790122471e108751e8594b86abbddac6974d84e1611d737e&X-Amz-SignedHeaders=host&x-amz-acl=public-read&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject
Request Method
OPTIONS
Status Code
403 Forbidden
Remote Address
51.159.62.18:443
Referrer Policy
strict-origin-when-cross-origin
content-length
252
content-type
application/xml
date
Wed, 13 Aug 2025 20:09:33 GMT
x-amz-id-2
txg00f62bca659d475990df-00689cf0fd
x-amz-request-id
txg00f62bca659d475990df-00689cf0fd
:authority
user-4a3uzddq7xqnfocwq-m2qquhr.s3.fr-par.scw.cloud
:method
OPTIONS
:path
/2025/08/a7ae32cd-0b02-4bee-97c7-556a7c3a5718.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=SCW53B4XGWQNEWBD5J9D%2F20250813%2Ffr-par%2Fs3%2Faws4_request&X-Amz-Date=20250813T200933Z&X-Amz-Expires=300&X-Amz-Signature=2ed22eb4b6d69747790122471e108751e8594b86abbddac6974d84e1611d737e&X-Amz-SignedHeaders=host&x-amz-acl=public-read&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject
:scheme
https
accept
_/_
accept-encoding
gzip, deflate, br, zstd
accept-language
sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7
access-control-request-headers
content-type,x-amz-acl
access-control-request-method
PUT
origin
https://api.vibepublic.com
priority
u=1, i
referer
https://api.vibepublic.com/
sec-fetch-dest
empty
sec-fetch-mode
cors
sec-fetch-site
cross-site
user-agent
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36
