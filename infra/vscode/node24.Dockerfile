FROM node:24

USER root

COPY scripts/install-common.sh /tmp/install-common.sh
COPY scripts/install-opencode.sh /tmp/install-opencode.sh

RUN sh /tmp/install-common.sh \
  && sh /tmp/install-opencode.sh \
  && rm -f /tmp/install-common.sh /tmp/install-opencode.sh

WORKDIR /workspace
EXPOSE 8080

CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080", "/workspace/repo"]
