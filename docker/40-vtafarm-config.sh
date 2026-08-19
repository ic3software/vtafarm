#!/bin/sh
# Renders /config.js from the environment. nginx runs /docker-entrypoint.d
# before starting and numbers its own scripts up to 30.
set -eu

: "${API_URL:?API_URL is not set - the frontend has no backend to talk to}"

# Explicit list: the template is JavaScript, and a bare envsubst eats every $NAME.
envsubst '${API_URL}' \
  < /etc/vtafarm/config.js.template \
  > /usr/share/nginx/html/config.js
