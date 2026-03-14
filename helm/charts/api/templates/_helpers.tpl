{{- define "api.fullname" -}}
{{- printf "%s-api" .Release.Name -}}
{{- end -}}

{{- define "api.labels" -}}
app.kubernetes.io/name: api
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end -}}

{{- define "api.selectorLabels" -}}
app.kubernetes.io/name: api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "api.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "api.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "api.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "api.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
