{{- define "web.fullname" -}}
{{- printf "%s-web" .Release.Name -}}
{{- end -}}

{{- define "web.labels" -}}
app.kubernetes.io/name: web
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "web.selectorLabels" -}}
app.kubernetes.io/name: web
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
