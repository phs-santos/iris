#!/bin/sh
# Gera um certificado autoassinado para o WSS do PBX de teste (válido por 2 anos).
set -e
cd "$(dirname "$0")"
mkdir -p keys
openssl req -x509 -newkey rsa:2048 -nodes -days 730 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout keys/asterisk.key -out keys/asterisk.crt
chmod 644 keys/asterisk.key keys/asterisk.crt
echo "Certificado gerado em docker/asterisk/keys"
