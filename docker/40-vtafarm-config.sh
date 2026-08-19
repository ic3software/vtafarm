#!/bin/sh
# Renders the browser-visible runtime config from the container's environment.
#
# The nginx image runs every executable in /docker-entrypoint.d before starting
# nginx and numbers its own scripts up to 30, so this one lands after them.
set -eu

: "${API_URL:?API_URL is not set - the frontend has no backend to talk to}"

# The explicit variable list matters: the template is JavaScript, and a bare
# envsubst would also substitute any other $NAME it found there.
envsubst '${API_URL}' \
  < /etc/vtafarm/config.js.template \
  > /usr/share/nginx/html/config.js
