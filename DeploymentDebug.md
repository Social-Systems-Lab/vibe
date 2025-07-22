# Deployment Debug Information

## Terraform Configuration

### `infra/terraform/main.tf`

```terraform
terraform {
  backend "s3" {
    bucket                      = "vibe-terraform-state" # This bucket must be created manually
    key                         = "terraform.tfstate"
    region                      = "fr-par"
    endpoint                    = "https://s3.fr-par.scw.cloud"
    access_key                  = var.scw_access_key
    secret_key                  = var.scw_secret_key
    skip_credentials_validation = true
    skip_region_validation      = true
  }
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = ">= 2.0.0"
    }
  }
}

provider "scaleway" {
  access_key = var.scw_access_key
  secret_key = var.scw_secret_key
  project_id = var.scw_project_id
  region     = var.scw_region
  zone       = var.scw_zone
}

# Private Network
resource "scaleway_vpc_private_network" "vibe_pn" {
  name = "vibe-private-network"
}

# Kubernetes Cluster
resource "scaleway_k8s_cluster" "vibe_cluster" {
  name                        = "vibe-kapsule"
  version                     = var.k8s_version
  cni                         = "cilium"
  type                        = "kapsule"
  delete_additional_resources = true
  private_network_id          = scaleway_vpc_private_network.vibe_pn.id
}

# Node Pool for the Cluster
resource "scaleway_k8s_pool" "vibe_pool" {
  cluster_id = scaleway_k8s_cluster.vibe_cluster.id
  name       = "vibe-pool"
  node_type  = "DEV1-M"
  size       = 2
  autohealing = true
  autoscaling = true
  min_size   = 1
  max_size   = 5
}

# Object Storage Bucket
resource "scaleway_object_bucket" "vibe_bucket" {
  name = "vibe-user-storage"
}

resource "scaleway_object_bucket_acl" "vibe_bucket_acl" {
  bucket = scaleway_object_bucket.vibe_bucket.name
  acl    = "private"
}

# Container Registry Namespace
resource "scaleway_registry_namespace" "vibe_registry" {
  name       = "vibe-registry"
  project_id = var.scw_project_id
  is_public  = false
}

# Outputs
output "k8s_endpoint" {
  value = scaleway_k8s_cluster.vibe_cluster.apiserver_url
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.vibe_registry.endpoint
}
```

### `infra/terraform/variables.tf`

```terraform
variable "scw_access_key" {
  description = "Scaleway access key"
  type        = string
  sensitive   = true
}

variable "scw_secret_key" {
  description = "Scaleway secret key"
  type        = string
  sensitive   = true
}

variable "scw_project_id" {
  description = "Scaleway project ID"
  type        = string
}

variable "scw_region" {
  description = "Scaleway region"
  type        = string
  default     = "fr-par"
}

variable "scw_zone" {
  description = "Scaleway zone"
  type        = string
  default     = "fr-par-1"
}

variable "k8s_version" {
  description = "Kubernetes version for the Kapsule cluster"
  type        = string
  default     = "1.31.2"
}
```

## Helm Configuration

### `infra/helm/vibe-cloud-api/values.yaml`

```yaml
# Default values for vibe-cloud-api.
# This is a YAML-formatted file.
# Declare variables to be passed into your templates.

replicaCount: 1

image:
    repository: rg.fr-par.scw.cloud/vibe-registry/vibe-cloud-api
    pullPolicy: IfNotPresent
    # Overrides the image tag whose default is the chart appVersion.
    tag: ""

service:
    type: ClusterIP
    port: 80

config:
    # Sensitive values are now in secrets.yaml
    jwtSecret: ""
    instanceIdSecret: ""
    couchdbUser: ""
    couchdbPassword: ""
    scalewayAccessKey: ""
    scalewaySecretKey: ""

    # Non-sensitive values
    couchdbUrl: "http://{{ .Release.Name }}-couchdb:5984"
    storageProvider: "scaleway"
    scalewayRegion: "fr-par"
    scalewayEndpoint: "s3.fr-par.scw.cloud"
    corsOrigin: "http://localhost:3001" # This will be overridden by the production URL
    port: "5000"

# CouchDB sub-chart configuration
couchdb:
    enabled: true
    auth:
        username: "" # Provided in secrets.yaml
        password: "" # Provided in secrets.yaml
    persistentVolume:
        enabled: true
        size: 8Gi

# CouchDB setup job configuration
couchdbSetupJob:
    enabled: true

ingress:
    enabled: true
    host: vibe-cloud-api.example.com # Replace with your domain
    annotations:
        cert-manager.io/cluster-issuer: letsencrypt-prod

ingress-nginx:
    controller:
        service:
            annotations:
                service.beta.kubernetes.io/scw-loadbalancer-type: "lb-s"
                service.beta.kubernetes.io/scw-loadbalancer-inbound-ports: "80,443"

clusterIssuer:
    email: admin@socialsystems.io
```

### `infra/helm/vibe-cloud-api/templates/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-deployment
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.config.port | int }}
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /health # Ensure your app has a /health endpoint
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "1Gi"
          envFrom:
            - secretRef:
                name: {{ .Release.Name }}-secret
          env:
            - name: COUCHDB_URL
              value: "http://{{ .Release.Name }}-couchdb:5984"
            - name: COUCHDB_USER
              valueFrom:
                secretKeyRef:
                  name: {{ .Release.Name }}-couchdb
                  key: adminUsername
            - name: COUCHDB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Release.Name }}-couchdb
                  key: adminPassword
```

### `infra/helm/vibe-cloud-api/templates/ingress.yaml`

```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}-ingress
  namespace: {{ .Release.Namespace }}
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - {{ .Values.ingress.host | quote }}
      secretName: {{ .Release.Name }}-tls
  rules:
    - host: {{ .Values.ingress.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}-service
                port:
                  number: 80
{{- end }}
```

## GitHub Actions Workflow

### `.github/workflows/deploy-helm-chart.yaml`

```yaml
name: Build, Push, and Deploy

on:
    workflow_dispatch:
    push:
        branches:
            - main
        paths:
            - "apps/vibe-cloud-api/**"
            - "infra/**"

jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout code
              uses: actions/checkout@v3

            - name: Set up QEMU
              uses: docker/setup-qemu-action@v2

            - name: Set up Docker Buildx
              uses: docker/setup-buildx-action@v2

            - name: Login to Scaleway Container Registry
              uses: docker/login-action@v2
              with:
                  registry: rg.fr-par.scw.cloud/vibe-registry
                  username: nologin
                  password: ${{ secrets.SCALEWAY_SECRET_KEY }}

            - name: Build and push Docker image
              uses: docker/build-push-action@v4
              with:
                  context: .
                  file: ./apps/vibe-cloud-api/Dockerfile
                  push: true
                  tags: rg.fr-par.scw.cloud/vibe-registry/vibe-cloud-api:latest,rg.fr-par.scw.cloud/vibe-registry/vibe-cloud-api:${{ github.sha }}

            - name: Setup Scaleway CLI
              uses: scaleway/action-scw@v0
              env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
              with:
                  version: v2.41.0
                  access-key: ${{ secrets.SCALEWAY_ACCESS_KEY }}
                  secret-key: ${{ secrets.SCALEWAY_SECRET_KEY }}
                  export-config: true
                  default-organization-id: ${{ secrets.SCALEWAY_ORGANIZATION_ID }}
                  default-project-id: ${{ secrets.SCALEWAY_PROJECT_ID }}

            - name: Generate Kubeconfig
              run: |
                  CLUSTER_ID=$(scw k8s cluster list name=vibe-kapsule region=fr-par -o json | jq -r '.[0].id')
                  scw k8s kubeconfig install $CLUSTER_ID region=fr-par
                  echo "KUBECONFIG=$HOME/.kube/config" >> $GITHUB_ENV

            - name: Set up Helm
              uses: azure/setup-helm@v3
              with:
                  version: "v3.9.4"

            - name: Add CouchDB Helm repository
              run: helm repo add couchdb https://apache.github.io/couchdb-helm

            - name: Update Helm dependencies
              run: helm dependency update ./infra/helm/vibe-cloud-api

            - name: Create secrets file
              run: |
                  cat << EOF > ./infra/helm/vibe-cloud-api/secrets.yaml
                  config:
                    jwtSecret: "${{ secrets.JWT_SECRET }}"
                    instanceIdSecret: "${{ secrets.INSTANCE_ID_SECRET }}"
                    scalewayAccessKey: "${{ secrets.SCALEWAY_ACCESS_KEY }}"
                    scalewaySecretKey: "${{ secrets.SCALEWAY_SECRET_KEY }}"
                  couchdb:
                    auth:
                      username: "admin"
                      password: "${{ secrets.COUCHDB_PASSWORD }}"
                    couchdbConfig:
                      couchdb:
                        uuid: "${{ secrets.COUCHDB_UUID }}"
                  EOF

            - name: Deploy Helm chart
              run: |
                  helm upgrade --install vibe-cloud-api ./infra/helm/vibe-cloud-api \
                    --namespace vibe --create-namespace \
                    --values ./infra/helm/vibe-cloud-api/secrets.yaml \
                    --set image.tag=${{ github.sha }} \
                    --set ingress.host=${{ secrets.INGRESS_HOST }} \
                    --set config.corsOrigin=${{ secrets.CORS_ORIGIN }} \
                    --set clusterIssuer.email=${{ secrets.CLUSTER_ISSUER_EMAIL }}
```

## Kubernetes Resources

### `kubectl get all -n vibe`

```
NAME                                                          READY   STATUS    RESTARTS      AGE
pod/vibe-cloud-api-cert-manager-cainjector-6d75d6477c-476dk   1/1     Running   0             102m
pod/vibe-cloud-api-cert-manager-cd5f7879b-cq4tg               1/1     Running   0             102m
pod/vibe-cloud-api-cert-manager-webhook-6b947c5f7-z5qpx       1/1     Running   0             102m
pod/vibe-cloud-api-couchdb-0                                  1/1     Running   0             32m
pod/vibe-cloud-api-couchdb-1                                  1/1     Running   0             33m
pod/vibe-cloud-api-couchdb-2                                  1/1     Running   0             33m
pod/vibe-cloud-api-deployment-678bccc88-l8jd4                 1/1     Running   2 (33m ago)   33m
pod/vibe-cloud-api-ingress-nginx-controller-b645cb775-8l78p   1/1     Running   0             102m

NAME                                                        TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)                      AGE
service/vibe-cloud-api-cert-manager                         ClusterIP      10.32.5.107    <none>           9402/TCP                     102m
service/vibe-cloud-api-cert-manager-webhook                 ClusterIP      10.32.5.222    <none>           443/TCP                      102m
service/vibe-cloud-api-couchdb                              ClusterIP      None           <none>           5984/TCP                     18h
service/vibe-cloud-api-ingress-nginx-controller             LoadBalancer   10.32.15.15    51.158.119.152   80:32414/TCP,443:31864/TCP   18h
service/vibe-cloud-api-ingress-nginx-controller-admission   ClusterIP      10.32.12.101   <none>           443/TCP                      18h
service/vibe-cloud-api-service                              ClusterIP      10.32.2.57     <none>           80/TCP                       18h
service/vibe-cloud-api-svc-couchdb                          ClusterIP      10.32.5.196    <none>           5984/TCP                     18h

NAME                                                      READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/vibe-cloud-api-cert-manager               1/1     1            1           102m
deployment.apps/vibe-cloud-api-cert-manager-cainjector    1/1     1            1           102m
deployment.apps/vibe-cloud-api-cert-manager-webhook       1/1     1            1           102m
deployment.apps/vibe-cloud-api-deployment                 1/1     1            1           18h
deployment.apps/vibe-cloud-api-ingress-nginx-controller   1/1     1            1           18h

NAME                                                                 DESIRED   CURRENT   READY   AGE
replicaset.apps/vibe-cloud-api-cert-manager-cainjector-6d75d6477c    1         1         1       102m
replicaset.apps/vibe-cloud-api-cert-manager-cd5f7879b                1         1         1       102m
replicaset.apps/vibe-cloud-api-cert-manager-webhook-6b947c5f7        1         1         1       102m
replicaset.apps/vibe-cloud-api-deployment-578578f59b                 0         0         0       18h
replicaset.apps/vibe-cloud-api-deployment-59d655c9dc                 0         0         0       102m
replicaset.apps/vibe-cloud-api-deployment-6745b4c7dc                 0         0         0       18h
replicaset.apps/vibe-cloud-api-deployment-678bccc88                  1         1         1       33m
replicaset.apps/vibe-cloud-api-deployment-754fc44c9b                 0         0         0       18h
replicaset.apps/vibe-cloud-api-deployment-77cb58454c                 0         0         0       18h
replicaset.apps/vibe-cloud-api-deployment-8497bc64f8                 0         0         0       18h
replicaset.apps/vibe-cloud-api-deployment-85db554664                 0         0         0       18h
replicaset.apps/vibe-cloud-api-deployment-86d7d6c5b                  0         0         0       18h
replicaset.apps/vibe-cloud-api-ingress-nginx-controller-558f4d5f74   0         0         0       18h
replicaset.apps/vibe-cloud-api-ingress-nginx-controller-b645cb775    1         1         1       102m

NAME                                      READY   AGE
statefulset.apps/vibe-cloud-api-couchdb   3/3     18h
```

### `kubectl describe certificate -n vibe`

```
Name:         vibe-cloud-api-tls
Namespace:    vibe
Labels:       app.kubernetes.io/managed-by=Helm
Annotations:  <none>
API Version:  cert-manager.io/v1
Kind:         Certificate
Metadata:
  Creation Timestamp:  2025-07-22T09:46:22Z
  Generation:          1
  Owner References:
    API Version:           networking.k8s.io/v1
    Block Owner Deletion:  true
    Controller:            true
    Kind:                  Ingress
    Name:                  vibe-cloud-api-ingress
    UID:                   89ee55cf-78d3-46e3-9a06-fb3fc68c1bcd
  Resource Version:        45160440972
  UID:                     0d34ff5c-1a4c-4c9c-8be8-2abfb794698c
Spec:
  Dns Names:
    api.vibeapp.dev
  Issuer Ref:
    Group:      cert-manager.io
    Kind:       ClusterIssuer
    Name:       letsencrypt-prod
  Secret Name:  vibe-cloud-api-tls
  Usages:
    digital signature
    key encipherment
Status:
  Conditions:
    Last Transition Time:  2025-07-22T09:46:22Z
    Message:               Certificate is up to date and has not expired
    Observed Generation:   1
    Reason:                Ready
    Status:                True
    Type:                  Ready
  Not After:               2025-10-20T08:31:40Z
  Not Before:              2025-07-22T08:31:41Z
  Renewal Time:            2025-09-20T08:31:40Z
Events:                    <none>
```

## Load Balancer Configuration

### `scw lb lb get e5614242-62e6-4237-a572-96f3d51d71de`

```
ID                     e5614242-62e6-4237-a572-96f3d51d71de
Name                   8e20773d-cf09-41dd-94da-21053f3d4982_a9f24d4a-b0bd-48de-a840-030d5529895d
Description            kubernetes service vibe-cloud-api-ingress-nginx-controller
Status                 ready
OrganizationID         94ae90b4-fe95-476e-a7b6-8c9ba22c3104
ProjectID              94ae90b4-fe95-476e-a7b6-8c9ba22c3104
Tags.0                 kapsule
Tags.1                 cluster=8e20773d-cf09-41dd-94da-21053f3d4982
Tags.2                 managed-by-scaleway-cloud-controller-manager
FrontendCount          2
BackendCount           2
Type                   lb-s
SslCompatibilityLevel  ssl_compatibility_level_intermediate
CreatedAt              18 hours ago
UpdatedAt              18 hours ago
PrivateNetworkCount    1
RouteCount             0
Region                 fr-par
Zone                   fr-par-1

IPs:
ID                                    IP ADDRESS
666574c2-ad4c-46ec-8f24-8ddab5bea33c  51.158.119.152

LB Instances:
ID                                    STATUS  IP ADDRESS  CREATED AT
4982fb68-e68c-4eee-985d-68216509869c  ready   -           18 hours ago

Warning: This resource is auto managed by Kapsule, all your modifications will be overwritten.
```

### `scw lb frontend get 31819414-9a78-4105-bf1b-80bf9ff2d698`

```
ID             31819414-9a78-4105-bf1b-80bf9ff2d698
Name           a9f24d4a-b0bd-48de-a840-030d5529895d_tcp_443
InboundPort    443
TimeoutClient  10m0s
CreatedAt      18 hours ago
UpdatedAt      18 hours ago
EnableHTTP3    false

Lb:
ID                     e5614242-62e6-4237-a572-96f3d51d71de
Name                   8e20773d-cf09-41dd-94da-21053f3d4982_a9f24d4a-b0bd-48de-a840-030d5529895d
Description            kubernetes service vibe-cloud-api-ingress-nginx-controller
Status                 ready
OrganizationID         94ae90b4-fe95-476e-a7b6-8c9ba22c3104
ProjectID              94ae90b4-fe95-476e-a7b6-8c9ba22c3104
Tags.0                 kapsule
Tags.1                 cluster=8e20773d-cf09-41dd-94da-21053f3d4982
Tags.2                 managed-by-scaleway-cloud-controller-manager
FrontendCount          2
BackendCount           2
Type                   lb-s
SslCompatibilityLevel  ssl_compatibility_level_intermediate
CreatedAt              18 hours ago
UpdatedAt              18 hours ago
PrivateNetworkCount    1
RouteCount             0
Region                 fr-par
Zone                   fr-par-1

IPs:
ID                                    IP ADDRESS
666574c2-ad4c-46ec-8f24-8ddab5bea33c  51.158.119.152

LB Instances:
ID   STATUS  IP ADDRESS  CREATED AT  UPDATED AT  REGION  ZONE

Warning: This resource is auto managed by Kapsule, all your modifications will be overwritten.

Backend:
ID                        2e96c2a9-5c0f-4bb1-ab52-1cdb731c8739
Name                      a9f24d4a-b0bd-48de-a840-030d5529895d_tcp_31864
ForwardProtocol           tcp
ForwardPort               31864
ForwardPortAlgorithm      roundrobin
StickySessions            none
StickySessionsCookieName  -
SendProxyV2               false
TimeoutServer             10s
TimeoutConnect            10m0s
TimeoutTunnel             10m0s
OnMarkedDownAction        on_marked_down_action_none
ProxyProtocol             proxy_protocol_none
CreatedAt                 18 hours ago
UpdatedAt                 18 hours ago
SslBridging               false
RedispatchAttemptCount    0
MaxRetries                3

Health Check:
Port             31864
CheckDelay       5s
CheckTimeout     5s
CheckMaxRetries  5
CheckSendProxy   false

Pool:
[172.16.0.4]

Lb:
ID                     e5614242-62e6-4237-a572-96f3d51d71de
Name                   8e20773d-cf09-41dd-94da-21053f3d4982_a9f24d4a-b0bd-48de-a840-030d5529895d
Description            kubernetes service vibe-cloud-api-ingress-nginx-controller
Status                 ready
OrganizationID         94ae90b4-fe95-476e-a7b6-8c9ba22c3104
ProjectID              94ae90b4-fe95-476e-a7b6-8c9ba22c3104
Tags.0                 kapsule
Tags.1                 cluster=8e20773d-cf09-41dd-94da-21053f3d4982
Tags.2                 managed-by-scaleway-cloud-controller-manager
FrontendCount          2
BackendCount           2
Type                   lb-s
SslCompatibilityLevel  ssl_compatibility_level_intermediate
CreatedAt              18 hours ago
UpdatedAt              18 hours ago
PrivateNetworkCount    1
RouteCount             0
Region                 fr-par
Zone                   fr-par-1

IPs:
ID                                    IP ADDRESS
666574c2-ad4c-46ec-8f24-8ddab5bea33c  51.158.119.152

LB Instances:
ID   STATUS  IP ADDRESS  CREATED AT  UPDATED AT  REGION  ZONE

Warning: This resource is auto managed by Kapsule, all your modifications will be overwritten.
```

## Logs

### `cert-manager`

```
I0722 08:07:36.410188       1 controller.go:284] "configured acme dns01 nameservers" logger="cert-manager.controller.build-context" nameservers=["10.32.0.10:53"]
W0722 08:07:36.410295       1 client_config.go:659] Neither --kubeconfig nor --master was specified.  Using the inClusterConfig.  This might not work.
I0722 08:07:36.412981       1 controller.go:89] "enabled controllers: [certificaterequests-approver certificaterequests-issuer-acme certificaterequests-issuer-ca certificaterequests-issuer-selfsigned certificaterequests-issuer-vault certificaterequests-issuer-venafi certificates-issuing certificates-key-manager certificates-metrics certificates-readiness certificates-request-manager certificates-revision-manager certificates-trigger challenges clusterissuers ingress-shim issuers orders]" logger="cert-manager.controller"
I0722 08:07:36.413004       1 controller.go:435] "serving insecurely as tls certificate data not provided" logger="cert-manager.controller"
I0722 08:07:36.413012       1 controller.go:102] "listening for insecure connections" logger="cert-manager.controller" address="0.0.0.0:9402"
I0722 08:07:36.413389       1 controller.go:127] "starting metrics server" logger="cert-manager.controller" address="[::]:9402"
I0722 08:07:36.413424       1 controller.go:178] "starting leader election" logger="cert-manager.controller"
I0722 08:07:36.413463       1 controller.go:171] "starting healthz server" logger="cert-manager.controller" address="[::]:9403"
I0722 08:07:36.415674       1 leaderelection.go:250] attempting to acquire leader lease kube-system/cert-manager-controller...
```

### `ingress-nginx-controller`

```
172.16.0.5 - - [22/Jul/2025:09:53:15 +0000] "\x12\x01\x00&\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\xFF" 400 150 "-" "-" 0 0.304 [] [] - - - - 6c1eccc42912cc6ca3398d93790d25ba0
172.16.0.5 - - [22/Jul/2025:09:53:16 +0000] "\x16\x03\x01\x00Q\x01\x00\x00M\x03\x03\x11\x9D\x95\x03\xA78\x16\x16i\xABq\xC2\xFA3\x17\xE7}%\xB1\x80\x7F\x01\xA8\x18~\xA6\x9A\xD60\xBF" 400 150 "-" "-" 0 0.293 [] [] - - - - 0f4ade5dbba7e77a08dc1bc4f32f8ea52
172.16.0.5 - - [22/Jul/2025:09:53:17 +0000] "SSH-2.0-WanScannerBot" 400 150 "-" "-" 0 0.289 [] [] - - - - e44bc414a8d10e081b71f43c383d342f
172.16.0.5 - - [22/Jul/2025:09:53:18 +0000] "\x03\x00\x00&!\xE0\x00\x00\xFE\xCA\x00Cookie: mstshash=" 400 150 "-" "-" 0 0.295 [] [] - - - - dd3e9663ddc2211db568692ca9798b0ba
172.16.0.5 - - [22/Jul/2025:09:53:19 +0000] "\x10\x0F\x00\x04MQTT\x04\x00\x00" 400 150 "-" "-" 0 0.307 [] [] - - - - 34ac1a53b15c97bba4618c0d69335ef4
172.16.0.5 - - [22/Jul/2025:09:53:20 +0000] "AMQP\x00\x00\x09\x01" 400 150 "-" "-" 0 0.308 [] [] - - - - 660b73e6088bf52bb7e2b1ff17206b1b
172.16.0.5 - - [22/Jul/2025:09:53:20 +0000] "\x00\x00\x00%\xFFSMBr\x00\x00\x00\x00\x18\x01(\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00" 400 150 "-" "-" 0 0.307 [] [] - - - - 009b9ee03ad1a5adccbc645028c1d3b2
172.16.0.5 - - [22/Jul/2025:09:53:21 +0000] "OPTIONS / RTSP/1.0" 400 150 "-" "-" 0 0.289 [] [] - - - - 0500d026e02b2ad31d1cd0293b7aa001
172.16.0.5 - - [22/Jul/2025:09:53:22 +0000] "\x00\x00\x00\x08\x04\xD2\x16/" 400 150 "-" "-" 0 0.304 [] [] - - - - 433dc77ef50333d7b19bac6fc81bbc56
172.16.0.5 - - [22/Jul/2025:09:53:23 +0000] "\x01\x00\x00\x00" 400 150 "-" "-" 0 0.311 [] [] - - - - 36a9cf194fa29180674d99b411155df6
```
