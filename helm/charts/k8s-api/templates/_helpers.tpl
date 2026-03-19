{{- define "k8s-api.fullname" -}}
{{- printf "%s-k8s-api" .Release.Name -}}
{{- end -}}

{{- define "k8s-api.labels" -}}
app.kubernetes.io/name: k8s-api
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: k8s-api
{{- end -}}

{{- define "k8s-api.selectorLabels" -}}
app.kubernetes.io/name: k8s-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
