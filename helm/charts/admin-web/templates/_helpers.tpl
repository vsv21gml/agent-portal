{{- define "admin-web.fullname" -}}
{{- printf "%s-admin-web" .Release.Name -}}
{{- end -}}

{{- define "admin-web.labels" -}}
app.kubernetes.io/name: admin-web
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: admin-web
{{- end -}}

{{- define "admin-web.selectorLabels" -}}
app.kubernetes.io/name: admin-web
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
