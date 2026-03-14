#!/bin/sh
set -eu

apt-get update
apt-get install -y curl git bash ca-certificates
rm -rf /var/lib/apt/lists/*

curl -fsSL https://code-server.dev/install.sh | sh
