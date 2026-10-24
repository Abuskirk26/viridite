#!/bin/sh
# Bring the VIRIDITE preview back after hibernate. Idempotent, returns quickly.
# Only the game may listen. A second server on 8091 was winning the live preview
# and showing the relay health line instead of the skirmish.
cd /workspace
if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev > /tmp/dev-server.log 2>&1 &
exit 0
