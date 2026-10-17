#!/bin/sh
# Bring the VIRIDITE preview back after hibernate. Idempotent, returns quickly.
cd /workspace
if ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8091/; then
  node relay/server.mjs > /tmp/relay.log 2>&1 &
fi
if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev > /tmp/dev-server.log 2>&1 &
exit 0
