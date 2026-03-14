FROM python:3.8

USER root

COPY scripts/install-common.sh /tmp/install-common.sh
COPY scripts/install-opencode.sh /tmp/install-opencode.sh

RUN sh /tmp/install-common.sh \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && sh /tmp/install-opencode.sh \
  && rm -f /tmp/install-common.sh /tmp/install-opencode.sh

WORKDIR /workspace
EXPOSE 8080

CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080", "/workspace/repo"]
