{{/*
Common labels
*/}}
{{- define "vibe-cloud-instance.labels" -}}
helm.sh/chart: {{ include "vibe-cloud-instance.chart" . }}
{{ include "vibe-cloud-instance.selectorLabels" . }}
{{- if .Chart.AppVersion }}

app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "vibe-cloud-instance.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vibe-cloud-instance.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "vibe-cloud-instance.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "vibe-cloud-instance.fullname" -}}
{{- if .Values.vibeApp.nameOverride -}}
{{- .Values.vibeApp.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create a default fully qualified name for the Vibe App.
*/}}
{{- define "vibe-cloud-instance.vibeApp.fullname" -}}
{{- if .Values.vibeApp.nameOverride -}}
{{- .Values.vibeApp.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name "vibe-app" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
Create a default fully qualified name for CouchDB.
*/}}
{{- define "vibe-cloud-instance.couchdb.fullname" -}}
{{- if .Values.couchdb.nameOverride -}}
{{- .Values.couchdb.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name "couchdb" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
Define the image for Vibe App
*/}}
{{- define "vibe-cloud-instance.vibeApp.image" -}}
{{- $repository := .Values.vibeApp.image.repository -}}
{{- $tag := .Values.vibeApp.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}

{{/*
Define the image for CouchDB
*/}}
{{- define "vibe-cloud-instance.couchdb.image" -}}
{{- $repository := .Values.couchdb.image.repository -}}
{{- $tag := .Values.couchdb.image.tag -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}

{{/*
Return the appropriate apiVersion for ingress.
*/}}
{{- define "vibe-cloud-instance.ingress.apiVersion" -}}
  {{- if and (.Capabilities.APIVersions.Has "networking.k8s.io/v1") (semverCompare ">=1.19-0" .Capabilities.KubeVersion.GitVersion) -}}
      {{- print "networking.k8s.io/v1" -}}
  {{- else if .Capabilities.APIVersions.Has "networking.k8s.io/v1beta1" -}}
    {{- print "networking.k8s.io/v1beta1" -}}
  {{- else -}}
    {{- print "extensions/v1beta1" -}}
  {{- end -}}
{{- end -}}

{{/*
Return the appropriate apiVersion for deployment.
*/}}
{{- define "vibe-cloud-instance.deployment.apiVersion" -}}
  {{- if .Capabilities.APIVersions.Has "apps/v1" -}}
    {{- print "apps/v1" -}}
  {{- else -}}
    {{- print "extensions/v1beta1" -}}
  {{- end -}}
{{- end -}}

{{/*
Return the appropriate apiVersion for statefulset.
*/}}
{{- define "vibe-cloud-instance.statefulset.apiVersion" -}}
  {{- if .Capabilities.APIVersions.Has "apps/v1" -}}
    {{- print "apps/v1" -}}
  {{- else -}}
    {{- print "apps/v1beta2" -}}
  {{- end -}}
{{- end -}}

{{/*
Construct the hostname for the ingress from instanceIdentifier and mainDomain
*/}}
{{- define "vibe-cloud-instance.ingress.host" -}}
{{- if .Values.ingress.host -}}
{{- .Values.ingress.host -}}
{{- else -}}
{{- printf "%s.%s" .Values.instanceIdentifier .Values.ingress.mainDomain -}}
{{- end -}}
{{- end -}}

{{/*
Get the namespace to use.
If namespaceOverride is set, use that. Otherwise, use the release namespace.
*/}}
{{- define "vibe-cloud-instance.namespace" -}}
{{- if .Values.namespaceOverride -}}
{{- .Values.namespaceOverride -}}
{{- else -}}
{{- .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{/*
Determine the name of the CouchDB secret to use.
If secrets.create is true, use the generated name.
Otherwise, use the name provided in secrets.existingCouchdbSecret.
*/}}
{{- define "vibe-cloud-instance.couchdbSecretName" -}}
{{- if .Values.secrets.create -}}
{{- printf "%s-couchdb-creds" (include "vibe-cloud-instance.fullname" .) -}}
{{- else -}}
{{- required "If secrets.create is false, secrets.existingCouchdbSecret must be provided" .Values.secrets.existingCouchdbSecret -}}
{{- end -}}
{{- end -}}

{{/*
Determine the name of the JWT secret to use.
If secrets.create is true, use the generated name.
Otherwise, use the name provided in secrets.existingJwtSecret.
*/}}
{{- define "vibe-cloud-instance.jwtSecretName" -}}
{{- if .Values.secrets.create -}}
{{- printf "%s-jwt-secret" (include "vibe-cloud-instance.fullname" .) -}}
{{- else -}}
{{- required "If secrets.create is false, secrets.existingJwtSecret must be provided" .Values.secrets.existingJwtSecret -}}
{{- end -}}
{{- end -}}
