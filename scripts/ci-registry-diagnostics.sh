#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Registry Diagnostics — for git.zoeconnect.in (Gitea registry).
#
# Purpose: the CI-side investigation is done — a real run showed a SINGLE,
# non-concurrent push hang for 700-850s before failing with
# "dial tcp 103.177.78.20:443: i/o timeout" on the OAuth token fetch. That
# duration rules out a plain TCP-level failure (Linux's default SYN retry
# timeout gives up in ~127s) and points higher in the stack: reverse proxy,
# the Gitea handler itself, the registry backend, a queued/blocked request,
# or the storage backend behind it. This script's job is to localize WHICH
# phase the delay is actually in — DNS, TCP connect, TLS handshake, HTTP
# request, registry auth, or storage — not just re-confirm that it fails.
#
# NOT wired into any CI workflow. Run manually.
#
# Usage:
#   ./ci-registry-diagnostics.sh client       # run from the Gitea runner (or anywhere with network access to the registry)
#   ./ci-registry-diagnostics.sh watch [interval_seconds] [output_file]
#                                              # repeats the client-side probe on a loop, timestamped, to catch an
#                                              # intermittent hang live rather than requiring perfect timing
#   ./ci-registry-diagnostics.sh server        # run ON the Gitea/registry host itself (needs SSH/console access there)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REGISTRY_HOST="git.zoeconnect.in"
REGISTRY_IP="103.177.78.20"   # from the observed error messages — cross-check this still matches `dig`/`getent` output below, DNS could have changed

section() { echo; echo "════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── Client-side: localize which phase the delay is in ───────────────────────
cmd_client() {
  section "DNS resolution"
  echo "What $REGISTRY_HOST currently resolves to (compare against the $REGISTRY_IP seen in build failures —"
  echo "if these ever differ, that's its own finding: DNS flapping between working/broken backends):"
  if have dig; then
    dig +short "$REGISTRY_HOST"
    dig +noall +stats "$REGISTRY_HOST" 2>&1 | grep -i "query time"
  else
    getent hosts "$REGISTRY_HOST"
  fi

  section "TCP connect timing (isolated from HTTP/TLS — just the handshake)"
  echo "Using curl's timing breakdown against the known-bad IP directly, bypassing DNS:"
  curl -o /dev/null -sS -w 'dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s http_code=%{http_code}\n' \
    --max-time 30 --resolve "${REGISTRY_HOST}:443:${REGISTRY_IP}" "https://${REGISTRY_HOST}/v2/" 2>&1 || echo "FAILED / TIMED OUT within 30s"

  section "TLS handshake in isolation (openssl s_client — shows exactly how far the handshake gets)"
  echo "| timeout 15 openssl s_client -connect ${REGISTRY_HOST}:443 -servername ${REGISTRY_HOST}"
  echo "Expected healthy output ends with 'Verify return code: 0 (ok)'. If this hangs, the problem is"
  echo "at or before TLS — i.e. genuinely network/connection level, not the Gitea application layer."
  timeout 15 openssl s_client -connect "${REGISTRY_HOST}:443" -servername "${REGISTRY_HOST}" </dev/null 2>&1 | tail -20

  section "The actual failing request: /v2/ (base registry check) — timed, verbose"
  echo "time curl -v --max-time 60 https://${REGISTRY_HOST}/v2/"
  time curl -v --max-time 60 "https://${REGISTRY_HOST}/v2/" 2>&1 | tail -40

  section "The actual failing request: /v2/token (the exact endpoint from the build error) — timed, verbose"
  echo "This is the closest reproduction of what BuildKit's push actually does. If this one hangs while"
  echo "/v2/ above responded fine, the delay is specifically in Gitea's OAuth/auth handler, not general"
  echo "reachability to the registry — a very different fix (application-level) than a network-level one."
  echo "time curl -v --max-time 900 \"https://${REGISTRY_HOST}/v2/token\""
  echo "(max-time set to 900s deliberately — long enough to actually observe whether it eventually"
  echo "responds like the real build did, rather than timing out this diagnostic before the real"
  echo "behavior reproduces. Ctrl-C early if you don't want to wait that long.)"
  time curl -v --max-time 900 "https://${REGISTRY_HOST}/v2/token" 2>&1 | tail -40

  section "Local TCP connection state (this host's view — any connections stuck in a non-ESTABLISHED state to the registry?)"
  if have ss; then
    ss -tan | grep -E "$REGISTRY_IP|State" || echo "(no current connections to $REGISTRY_IP)"
  fi

  section "TCP stack health (retransmits/timeouts — same idea as the Docker networking investigation, host-level this time)"
  if have netstat; then
    netstat -s 2>&1 | grep -iA2 "retrans\|timeout"
  else
    cat /proc/net/snmp 2>/dev/null | grep -A1 "^Tcp:"
  fi

  echo
  echo "── Reading this ──"
  echo "DNS slow/wrong -> DNS-side issue, not the registry itself."
  echo "TCP connect slow/hangs, TLS never starts -> network-level (routing, firewall, packet loss to"
  echo "  this specific host) — closer to the earlier Docker-networking-style hypotheses, but now"
  echo "  confirmed host-wide rather than container-specific."
  echo "TCP connect fast, TLS handshake slow/hangs -> TLS termination point (nginx/Apache/whatever"
  echo "  reverse proxy sits in front of Gitea, if any) is struggling — worth checking its own logs/config."
  echo "TCP+TLS fast, /v2/ responds fine, but /v2/token specifically hangs -> the problem is inside"
  echo "  Gitea's own OAuth/registry-auth handler (a blocked goroutine, a slow DB/storage-backend call"
  echo "  it makes as part of issuing the token, etc.) — this is the 'server' section below's job to"
  echo "  confirm from the other side."
}

cmd_watch() {
  local interval="${1:-30}"
  local outfile="${2:-/tmp/ci-registry-watch-$(date +%Y%m%d-%H%M%S).log}"
  echo "Probing /v2/token every ${interval}s. Writing to: $outfile"
  echo "Ctrl-C to stop. Let this run for a while unattended — the goal is to catch the hang happening"
  echo "live and see whether it's constant, periodic, or load-correlated with something else on a"
  echo "schedule (backups, log rotation, other cron jobs on the registry host, etc.)."
  trap 'echo; echo "Stopped. Log: $outfile"; exit 0' INT
  while true; do
    ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    result=$(curl -o /dev/null -sS -w 'total=%{time_total}s http_code=%{http_code}' --max-time 60 "https://${REGISTRY_HOST}/v2/token" 2>&1)
    echo "$ts  $result" | tee -a "$outfile"
    sleep "$interval"
  done
}

# ── Server-side: run ON the Gitea/registry host, ideally DURING a failing push ──
cmd_server() {
  section "Server-side checklist — run these ON the Gitea/registry host itself"
  echo "This script cannot run these remotely — it can only print what to run and why, since it"
  echo "requires SSH/console access to the registry host, which is outside anything reachable from"
  echo "the Gitea runner or this repository."
  cat <<'EOF'

1. Is the Gitea (and, if separate, registry-backend) process actually healthy right now?
   docker ps                         # is the container running, and for how long (recent restart = crash-looping?)
   docker logs --since 15m gitea     # (adjust container name) — look specifically for anything logged
                                      # around a timestamp matching a failed push, errors/panics/slow-query
                                      # warnings, or repeated auth attempts from the runner's IP

2. Is the reverse proxy (if Gitea sits behind Apache/nginx/Caddy/Traefik) the bottleneck?
   - Check ITS access/error logs for the same time window, specifically for the /v2/token path.
   - Check its configured proxy_read_timeout / ProxyTimeout / equivalent — if it's set very high or
     unlimited, that would explain why the client (BuildKit) waits 700-850s instead of failing fast:
     the proxy is faithfully waiting on a backend that itself never responds, rather than the proxy
     itself being slow.
   - Check its own worker/connection limits (e.g. Apache's MaxRequestWorkers, nginx's worker_connections)
     — if exhausted, new requests queue silently rather than being rejected, which can look exactly
     like "waiting" from the client's perspective.

3. Resource pressure on the registry host, captured DURING a failing push if at all possible
   (run 'watch' above from elsewhere to know when to look, or just sample repeatedly):
   docker stats --no-stream          # per-container CPU/mem — is Gitea's container pegged or thrashing?
   top                               # host-wide picture — is something ELSE on this host consuming
                                      # resources at the same time pushes fail?
   iostat -x 1 5                     # disk I/O — registry blob storage (especially if backed by network/
                                      # block storage rather than local NVMe) can stall under load,
                                      # and an OAuth token issuance can involve a DB write/read that
                                      # blocks on the same disk as the blob store
   df -h                             # is the disk backing Gitea's data directory near full? (Some
                                      # storage backends degrade badly, not just fail cleanly, as they
                                      # approach capacity)
   free -h                           # memory pressure/swapping

4. Database health (Gitea's token issuance typically involves a DB lookup/write)
   - If Gitea uses Postgres/MySQL/SQLite: check for slow queries, lock contention, or connection
     pool exhaustion around the same timestamps. A blocked DB connection pool would produce exactly
     this symptom — the HTTP handler is alive and accepted the connection, but hangs waiting on a
     DB call that never returns, until the client eventually gives up.

5. Network path FROM the registry host's perspective (rules out asymmetric routing issues)
   - Check whether the registry host has any egress-dependent step in issuing a token (e.g. calling
     out to an external identity provider) — if so, test that path's health independently, since a
     hang there would look identical to a "Gitea is slow" symptom from the runner's side.

Correlate whatever you find here against the exact timestamps of the client-side 'watch' log —
that pairing (client saw X hang at time T, server showed Y happening at time T) is the strongest
possible evidence for pinpointing the actual cause.
EOF
}

case "${1:-}" in
  client) cmd_client ;;
  watch)  shift; cmd_watch "$@" ;;
  server) cmd_server ;;
  *)
    echo "Usage: $0 {client|watch [interval_seconds] [output_file]|server}"
    exit 1
    ;;
esac
