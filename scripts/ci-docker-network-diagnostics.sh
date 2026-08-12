#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Docker / Container Networking Diagnostics — for the Gitea Actions runner.
#
# Purpose: progressively isolate whether the multi-hundred-second stalls seen
# between `apt-get` package downloads (e.g. 499s, 728s, 868s gaps) originate
# in Docker's bridge networking / MTU / DNS path, as opposed to BuildKit
# itself or the host's raw internet connectivity (which a plain `curl` from
# the host already shows is healthy for small requests).
#
# NOT wired into any Dockerfile or CI workflow. Run manually, by hand, on the
# runner. Nothing here modifies system state except where explicitly labeled
# "OPTIONAL / DESTRUCTIVE" (packet captures write files; nothing else does).
#
# Usage:
#   ./ci-docker-network-diagnostics.sh decisive     # RUN THIS FIRST — 3-way apt-get isolation test
#   ./ci-docker-network-diagnostics.sh all          # everything else, in order
#   ./ci-docker-network-diagnostics.sh bridge        # section 1
#   ./ci-docker-network-diagnostics.sh mtu           # section 2
#   ./ci-docker-network-diagnostics.sh dns           # section 3
#   ./ci-docker-network-diagnostics.sh routing       # section 4
#   ./ci-docker-network-diagnostics.sh daemon        # section 5
#   ./ci-docker-network-diagnostics.sh compare       # section 9 (host vs container vs buildkit ns, curl-based)
#   ./ci-docker-network-diagnostics.sh capture [iface] [seconds]  # section 8, OPTIONAL/DESTRUCTIVE (writes a .pcap)
#
# "decisive" must be run WHILE a build-images job is actually in progress on
# this runner (it needs a live buildx_buildkit_* container to attach to for
# leg 3) — start a push to hybrid-architecture, then run this within the
# ~80-100 minute build window.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

section() { echo; echo "════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── 0. DECISIVE TEST — host vs plain container vs BuildKit's actual netns ───
# This is the test to run first. It settles, in one pass, whether the
# problem is (a) the host's own path to Debian's mirror network, (b) Docker's
# generic bridge networking, or (c) something specific to how BuildKit's own
# container is networked — which is a materially different question than (b),
# because `docker buildx build` runs BuildKit itself inside a `moby/buildkit`
# container (via the docker-container driver) with its own network namespace,
# NOT the same path a plain `docker run` takes. A `docker exec` into some
# other unrelated container, or a fresh `docker run`, does NOT test BuildKit's
# actual netns — only a container explicitly attached via
# `--network container:<buildkit-container-name>` does that.
#
# Uses `apt-get install --download-only` rather than a full install: this
# reproduces the exact "Get:" download-phase output from your build logs
# (the phase where the stalls were observed) without permanently modifying
# host package state. `apt-get clean` is run after each leg to remove the
# downloaded .debs.
sec_decisive() {
  section "0. DECISIVE TEST: host -> plain container -> BuildKit's actual network namespace"

  echo "-- Leg 1: HOST --"
  echo "   (Mutates host apt cache only — cleaned up after. No package installed/configured.)"
  time (apt-get update && apt-get install -y --download-only build-essential) 2>&1
  apt-get clean 2>&1

  echo
  echo "-- Leg 2: PLAIN DOCKER CONTAINER (bridge network, ephemeral, --rm) --"
  time docker run --rm debian:bookworm bash -c "
    apt-get update &&
    time apt-get install -y --download-only build-essential
  " 2>&1

  echo
  echo "-- Leg 3: BUILDKIT'S ACTUAL NETWORK NAMESPACE --"
  BUILDER_CONTAINER=$(docker ps --filter "name=buildx_buildkit" --format '{{.Names}}' | head -1)
  if [ -z "$BUILDER_CONTAINER" ]; then
    echo "   No running buildx_buildkit_* container found. This leg requires a build-images"
    echo "   job to be ACTIVELY RUNNING on this runner right now — start a push to"
    echo "   hybrid-architecture and re-run './ci-docker-network-diagnostics.sh decisive'"
    echo "   while it's building. Skipping leg 3 for this run."
  else
    echo "   Found: $BUILDER_CONTAINER"
    echo
    echo "   Network mode (as you asked for specifically):"
    docker inspect "$BUILDER_CONTAINER" --format '{{.HostConfig.NetworkMode}}'
    echo
    echo "   Interfaces inside the BuildKit container:"
    docker exec "$BUILDER_CONTAINER" ip addr 2>&1 || echo "   (ip not available in this image, or exec failed — trying nsenter fallback below)"
    echo
    echo "   Routes inside the BuildKit container:"
    docker exec "$BUILDER_CONTAINER" ip route 2>&1 || echo "   (see nsenter fallback)"
    PID=$(docker inspect "$BUILDER_CONTAINER" --format '{{.State.Pid}}' 2>/dev/null)
    if [ -n "$PID" ]; then
      echo
      echo "   nsenter fallback (run as root if the execs above failed):"
      echo "   nsenter -t $PID -n ip addr"
      echo "   nsenter -t $PID -n ip route"
    fi
    echo
    echo "   THE KEY TEST — a fresh debian container sharing BuildKit's exact network"
    echo "   namespace via --network container:$BUILDER_CONTAINER (this is NOT the same as"
    echo "   docker exec into BuildKit's own minimal image, which typically has no apt/bash;"
    echo "   this attaches a full debian filesystem to BuildKit's actual netns instead):"
    time docker run --rm --network "container:$BUILDER_CONTAINER" debian:bookworm bash -c "
      apt-get update &&
      time apt-get install -y --download-only build-essential
    " 2>&1
  fi

  echo
  echo "── Reading this result ──"
  echo "If Leg 1 (host) is fast, Leg 2 (plain container) is fast, but Leg 3 (BuildKit netns)"
  echo "is slow: the problem is specific to BuildKit's own container networking/driver-opts —"
  echo "stop investigating MTU/mirrors/apt generally and focus entirely on BuildKit's network"
  echo "configuration (the --driver-opt network=host setting on the persistent builder,"
  echo "buildkitd's own DNS/proxy handling, or how containerd-shim networks BuildKit's"
  echo "execution containers for RUN steps specifically, which can differ AGAIN from the"
  echo "BuildKit control container's own netns tested here)."
  echo
  echo "If Leg 1 is fast but Legs 2 AND 3 are both slow: generic Docker bridge networking is"
  echo "implicated (not something BuildKit-specific) — the MTU/conntrack/DNS hypotheses in"
  echo "sections 1-3 below become much stronger, and Fix A/B in the report are the right next"
  echo "step."
  echo
  echo "If all three legs are fast: neither Docker networking nor BuildKit's networking is at"
  echo "fault under this test's conditions — the remaining unexplained gap likely lies"
  echo "somewhere else entirely (worth revisiting the runner CPU/memory/disk telemetry from"
  echo "the earlier investigation pass, or re-running this test during higher concurrent load"
  echo "to see if the problem is load-dependent rather than present at all times)."
}

# ── 1. Docker bridge networking ─────────────────────────────────────────────
sec_bridge() {
  section "1. Docker bridge networking"

  echo "-- docker0 device state --"
  ip -d link show docker0 2>&1 || echo "docker0 not found (custom bridge in use? check 'docker network ls')"

  echo
  echo "-- docker network inspect bridge --"
  docker network inspect bridge 2>&1

  echo
  echo "-- All docker networks (buildx may use its own) --"
  docker network ls

  echo
  echo "-- iptables NAT table (look for MASQUERADE rule + packet/byte counters) --"
  if have iptables; then
    iptables -t nat -L POSTROUTING -n -v --line-numbers 2>&1
  else
    echo "iptables not found — checking nftables:"
    have nft && nft list ruleset 2>&1 | grep -A5 -i nat
  fi

  echo
  echo "-- iptables FORWARD chain (Docker inserts per-network rules here; a DROP-heavy"
  echo "   chain or one with unexpectedly high packet counts on REJECT/DROP rules is a signal) --"
  have iptables && iptables -L FORWARD -n -v --line-numbers 2>&1

  echo
  echo "-- conntrack table: current usage vs max (exhaustion => new connections silently"
  echo "   dropped/delayed until an old entry times out, which can look exactly like a stall) --"
  if have conntrack; then
    echo "Current entries: $(conntrack -C 2>/dev/null)"
    echo "Max: $(cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null)"
    echo "Sample of entries in SYN_SENT / no-reply state (these are the ones worth looking at):"
    conntrack -L 2>/dev/null | grep -i "SYN_SENT\|UNREPLIED" | head -20
  else
    echo "conntrack CLI not installed (apt-get install -y conntrack). Falling back to /proc:"
    cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null
    cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null
  fi

  echo
  echo "-- Retransmission counters (host-wide; a climbing TCPRetransFail or -w delta during"
  echo "   a build correlates strongly with blackhole/MTU issues rather than bandwidth) --"
  if have ss; then
    ss -s
  fi
  echo "netstat -s TCP section (retransmits, timeouts):"
  if have netstat; then
    netstat -s 2>&1 | grep -iA2 "retrans\|timeout"
  else
    cat /proc/net/snmp 2>/dev/null | grep -A1 "^Tcp:"
  fi
}

# ── 2. MTU mismatch ──────────────────────────────────────────────────────────
sec_mtu() {
  section "2. MTU — Oracle VNIC vs docker0 vs BuildKit network namespace"

  primary_iface=$(ip route get 1.1.1.1 2>/dev/null | awk '/dev/ {for(i=1;i<=NF;i++) if ($i=="dev") print $(i+1)}')
  echo "Primary egress interface detected: ${primary_iface:-unknown}"

  echo
  echo "-- Host interface MTUs --"
  for ifc in "$primary_iface" docker0; do
    [ -n "$ifc" ] && [ -e "/sys/class/net/$ifc/mtu" ] && echo "$ifc: $(cat /sys/class/net/$ifc/mtu)"
  done
  echo "All interfaces:"
  ip -o link show | awk -F': ' '{print $2}' | while read -r ifc; do
    ifc=$(echo "$ifc" | cut -d@ -f1)
    [ -e "/sys/class/net/$ifc/mtu" ] && echo "  $ifc: $(cat /sys/class/net/$ifc/mtu)"
  done

  echo
  echo "-- MTU as seen INSIDE a plain container (bridge network) --"
  docker run --rm alpine:latest sh -c 'ip -o link show eth0 2>/dev/null || cat /sys/class/net/eth0/mtu' 2>&1

  echo
  echo "-- Oracle Cloud VCN reference values (documented, for comparison only — not fetched live):"
  echo "   Oracle's own guidance: VNICs default to 9000 (jumbo) on the backend subnet in many"
  echo "   shapes/images, but the OS-visible interface MTU depends on the image/OS network config"
  echo "   and is not guaranteed to be 9000. Docker's docker0 bridge defaults to 1500 regardless"
  echo "   of the host NIC's MTU, UNLESS explicitly configured in /etc/docker/daemon.json."
  echo "   A host NIC at 9000 with docker0 left at the 1500 default is not itself a bug — but if"
  echo "   the host NIC MTU is something OTHER than 1500 and OTHER than 9000 (some OCI configs use"
  echo "   9000 on the physical NIC but an overlay/VCN path that only reliably carries slightly"
  echo "   less, e.g. VXLAN/Geneve encapsulation overhead), path MTU can end up smaller than what"
  echo "   any layer believes it is — the classic setup for a PMTUD blackhole."

  echo
  echo "-- PMTUD blackhole probe: descending DF-flagged pings to deb.debian.org --"
  echo "   (If a size below ~1472 succeeds but sizes just above it silently time out INSTEAD OF"
  echo "   returning 'Frag needed', that's a strong blackhole signal — see finding writeup.)"
  for size in 1472 1450 1400 1300 1200; do
    printf "  DF ping, %d-byte payload (%d incl. headers): " "$size" "$((size+28))"
    if ping -M do -c 2 -W 3 -s "$size" deb.debian.org >/tmp/mtu_probe_$size.log 2>&1; then
      echo "OK"
    else
      grep -qi "Frag needed\|Message too long" /tmp/mtu_probe_$size.log && echo "ICMP Frag-Needed received (PMTUD working correctly)" || echo "TIMED OUT / NO RESPONSE (possible blackhole — ICMP frag-needed is being filtered)"
    fi
  done

  echo
  echo "-- Same probe run FROM INSIDE a container, to see if the container's path differs --"
  for size in 1472 1400; do
    printf "  [container] DF ping, %d-byte payload: " "$size"
    docker run --rm alpine:latest sh -c "ping -M do -c 2 -W 3 -s $size deb.debian.org" >/tmp/mtu_probe_container_$size.log 2>&1 \
      && echo "OK" \
      || { grep -qi "Frag needed\|Message too long" /tmp/mtu_probe_container_$size.log && echo "ICMP Frag-Needed received" || echo "TIMED OUT / NO RESPONSE"; }
  done

  echo
  echo "-- tracepath (shows the MTU discovered hop-by-hop; look for where it drops) --"
  have tracepath && tracepath -n deb.debian.org 2>&1 | head -20
}

# ── 3. DNS inside containers ─────────────────────────────────────────────────
sec_dns() {
  section "3. DNS: host vs container"

  echo "-- Host /etc/resolv.conf --"
  cat /etc/resolv.conf 2>&1

  echo
  echo "-- Is systemd-resolved in play on the host? --"
  if have resolvectl; then
    resolvectl status 2>&1 | head -30
  else
    echo "systemd-resolved not detected (no resolvectl binary)."
  fi

  echo
  echo "-- Container /etc/resolv.conf (what Docker's embedded DNS actually hands the container) --"
  docker run --rm alpine:latest cat /etc/resolv.conf 2>&1

  echo
  echo "-- Does the container prefer IPv6? (AAAA-first + broken/blackholed IPv6 egress is a"
  echo "   very common source of exactly this kind of stall — connect() hangs on the AAAA"
  echo "   result until it times out and falls back to the working A record) --"
  echo "   Host gai.conf / getaddrinfo order:"
  cat /etc/gai.conf 2>&1 | grep -v '^#' | grep -v '^$' || echo "(default — IPv6 preferred per RFC 3484 unless overridden)"
  echo
  echo "   Does the host have a default IPv6 route at all?"
  ip -6 route show default 2>&1 || echo "(no IPv6 default route on host)"
  echo
  echo "   Does the CONTAINER get an IPv6 address on the default bridge?"
  docker run --rm alpine:latest sh -c "ip -6 addr show eth0 2>/dev/null || echo 'no IPv6 on eth0 (expected — docker0 is IPv4-only by default)'"

  echo
  echo "-- Direct DNS resolution timing comparison: host vs container --"
  echo "   Host, via dig (or getent as fallback):"
  if have dig; then
    dig +noall +stats deb.debian.org 2>&1 | grep -i "query time"
    dig +noall +stats registry.npmjs.org 2>&1 | grep -i "query time"
  else
    time getent hosts deb.debian.org
  fi
  echo "   Container:"
  docker run --rm alpine:latest sh -c "apk add --no-cache bind-tools >/dev/null 2>&1; dig +noall +stats deb.debian.org 2>&1 | grep -i 'query time'" 2>&1

  echo
  echo "-- Docker daemon DNS override (if daemon.json sets 'dns', every container uses that"
  echo "   resolver instead of the host's — worth knowing if it differs from the host's) --"
  grep -A3 '"dns"' /etc/docker/daemon.json 2>/dev/null || echo "(no 'dns' key in daemon.json — containers get Docker's embedded DNS at 127.0.0.11, forwarding to the host's configured resolvers)"
}

# ── 4. Routing differences (bridge vs host vs BuildKit) ─────────────────────
sec_routing() {
  section "4. Routing: host vs bridge container vs BuildKit's own network"

  echo "-- Host default route --"
  ip route show default

  echo
  echo "-- Container (bridge network) default route --"
  docker run --rm alpine:latest ip route show default 2>&1

  echo
  echo "-- BuildKit builder's network mode --"
  echo "   (docker-container driver builders run BuildKit itself AS a container — inspect it"
  echo "   directly rather than assuming it matches a plain 'docker run')"
  BUILDER_CONTAINER=$(docker ps --filter "name=buildx_buildkit" --format '{{.Names}}' | head -1)
  if [ -n "$BUILDER_CONTAINER" ]; then
    echo "Found BuildKit container: $BUILDER_CONTAINER"
    docker inspect "$BUILDER_CONTAINER" --format 'NetworkMode: {{.HostConfig.NetworkMode}}'
    docker inspect "$BUILDER_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool 2>/dev/null
    echo
    echo "Route table INSIDE the BuildKit container's network namespace:"
    docker exec "$BUILDER_CONTAINER" sh -c "ip route show default; cat /sys/class/net/eth0/mtu 2>/dev/null" 2>&1 \
      || echo "(exec into the BuildKit container failed — it may be a minimal image without a shell; use nsenter with its PID instead, see below)"
    PID=$(docker inspect "$BUILDER_CONTAINER" --format '{{.State.Pid}}')
    echo "If exec failed, try (as root): nsenter -t $PID -n ip route show default"
  else
    echo "No running 'buildx_buildkit_*' container found — either no build is in progress right"
    echo "now, or the persistent builder from the workflow update hasn't run yet. Re-run this"
    echo "section while a build-images job is actually executing on this runner."
  fi

  echo
  echo "-- Is the BuildKit builder using --driver-opt network=host or the default bridge? --"
  echo "   (the workflow's persistent-builder step sets --driver-opt network=host — this means"
  echo "   BuildKit's OWN control-plane traffic uses the host network namespace directly, but"
  echo "   each individual RUN step inside a Dockerfile build still gets its own network"
  echo "   namespace via runc/containerd-shim, which is NOT the same as the host's. This is the"
  echo "   layer that actually matters for 'why does apt inside a RUN step stall' — the diagnostics"
  echo "   above simulate that layer via 'docker run alpine' since directly inspecting an"
  echo "   in-progress RUN step's netns requires catching it mid-build; see 'compare' section.)"
}

# ── 5. Docker daemon configuration ──────────────────────────────────────────
sec_daemon() {
  section "5. /etc/docker/daemon.json review"

  if [ -f /etc/docker/daemon.json ]; then
    echo "-- Contents --"
    cat /etc/docker/daemon.json
    echo
    echo "-- Flagging anything relevant to this investigation --"
    python3 - <<'PYEOF' 2>/dev/null || cat /etc/docker/daemon.json
import json, sys
try:
    d = json.load(open('/etc/docker/daemon.json'))
except Exception as e:
    print(f"(could not parse as JSON: {e})")
    sys.exit(0)
for key in ('mtu', 'dns', 'dns-opts', 'dns-search', 'registry-mirrors', 'insecure-registries',
            'experimental', 'bridge', 'fixed-cidr', 'default-address-pools', 'iptables', 'ip-forward'):
    if key in d:
        print(f"  {key}: {d[key]}")
    else:
        print(f"  {key}: (not set — Docker default in effect)")
PYEOF
  else
    echo "/etc/docker/daemon.json does not exist — Docker is running with 100% built-in defaults"
    echo "(bridge MTU 1500, embedded DNS at 127.0.0.11 forwarding to host resolvers, no registry"
    echo "mirrors, iptables management enabled). This itself is useful to know: it rules out a"
    echo "misconfigured daemon.json as a cause, but also means no MTU override is currently in"
    echo "place even if the host NIC uses a non-1500 MTU (see section 2)."
  fi

  echo
  echo "-- docker info (cross-check against daemon.json, catches CLI-flag-set values too) --"
  docker info 2>&1 | grep -iE "mtu|dns|registry mirror|cgroup driver|storage driver|native overlay"
}

# ── 9. Host vs container vs BuildKit-netns comparison ───────────────────────
sec_compare() {
  section "9. Performance comparison: host -> container -> BuildKit netns"

  urls="https://deb.debian.org/debian https://registry.npmjs.org https://github.com https://nodejs.org"
  fmt='dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s size=%{size_download}b speed=%{speed_download}B/s\n'

  echo "-- HOST --"
  for u in $urls; do printf "%-40s " "$u"; curl -o /dev/null -sS -w "$fmt" --max-time 20 "$u" || echo "FAILED"; done

  echo
  echo "-- BRIDGE CONTAINER (docker run alpine — same path a Dockerfile RUN step takes) --"
  docker run --rm alpine:latest sh -c "
    apk add --no-cache curl >/dev/null 2>&1
    for u in $urls; do
      printf '%-40s ' \"\$u\"
      curl -o /dev/null -sS -w '$fmt' --max-time 20 \"\$u\" || echo FAILED
    done
  " 2>&1

  BUILDER_CONTAINER=$(docker ps --filter "name=buildx_buildkit" --format '{{.Names}}' | head -1)
  echo
  if [ -n "$BUILDER_CONTAINER" ]; then
    echo "-- BUILDKIT CONTAINER NETNS ($BUILDER_CONTAINER) — best-effort, minimal image may lack curl --"
    docker exec "$BUILDER_CONTAINER" sh -c "
      which curl >/dev/null 2>&1 || { echo 'no curl in BuildKit image — cannot run this leg directly.'; exit 0; }
      for u in $urls; do
        printf '%-40s ' \"\$u\"
        curl -o /dev/null -sS -w '$fmt' --max-time 20 \"\$u\" || echo FAILED
      done
    " 2>&1
  else
    echo "-- BUILDKIT CONTAINER NETNS: skipped, no build currently in progress. --"
    echo "   Re-run 'compare' while a build-images job is running on this runner for the full"
    echo "   3-way comparison — that's the version that actually matches what a stalling"
    echo "   'apt-get install' inside the real build experiences."
  fi

  echo
  echo "-- Reading this comparison --"
  echo "   If HOST is fast and BRIDGE CONTAINER is fast too: Docker networking is very likely"
  echo "   NOT the cause for SMALL requests — but this curl test, like the one already run from"
  echo "   the host, only exercises a small payload. It does NOT rule out an MTU blackhole that"
  echo "   only manifests on larger transfers (see section 2's DF-ping sweep, and consider"
  echo "   re-running this comparison with a real multi-MB file, e.g. add"
  echo "   'curl -o /dev/null http://deb.debian.org/debian/pool/main/c/cpp-12/<a real .deb URL>'"
  echo "   to each leg above)."
  echo "   If HOST is fast but BRIDGE CONTAINER is slow: points at docker0/NAT/conntrack/DNS-in-"
  echo "   container (sections 1 and 3)."
  echo "   If BRIDGE CONTAINER is fast but the real build still stalls: the difference must be"
  echo "   something specific to the BuildKit container's netns/driver-opts, or something that"
  echo "   only manifests under the concurrent load of 5 simultaneous matrix jobs (conntrack/NAT"
  echo "   contention, section 1's conntrack table check) rather than a single isolated request."
}

# ── 8. Packet capture (OPTIONAL / DESTRUCTIVE — writes a file) ──────────────
sec_capture() {
  local iface="${1:-docker0}"
  local seconds="${2:-60}"
  local outfile="/tmp/docker-net-capture-$(date +%Y%m%d-%H%M%S).pcap"

  section "8. Packet capture on $iface for ${seconds}s -> $outfile"
  if ! have tcpdump; then
    echo "tcpdump not installed. Install with: apt-get install -y tcpdump"
    return 1
  fi
  echo "Capturing port 80/443 traffic on $iface. Trigger an apt-get install (or a real build) in"
  echo "another session NOW, ideally targeting deb.debian.org specifically, while this runs."
  echo "Expected HEALTHY pattern: steady stream of same-size data segments + ACKs, connection"
  echo "closes cleanly (FIN/ACK) after the transfer completes."
  echo "Expected UNHEALTHY (blackhole) pattern: after the handshake, you'll see the SAME segment"
  echo "(same TCP sequence number) retransmitted repeatedly with growing gaps between attempts"
  echo "(1s, 2s, 4s, 8s... exponential backoff), NO 'ICMP time exceeded/frag needed' response"
  echo "ever appears in the capture, and eventually either the connection gives up (RST) or the"
  echo "OS-level TCP retransmission timeout fires after minutes."
  echo "Expected UNHEALTHY (conntrack) pattern: SYN sent, no SYN-ACK ever arrives, repeated SYN"
  echo "retransmissions at 1s/2s/4s.../standard backoff intervals, eventually giving up (~127s"
  echo "with Linux defaults) — this looks different from the blackhole pattern (no data phase"
  echo "is ever reached at all)."
  echo
  timeout "$seconds" tcpdump -i "$iface" -w "$outfile" 'port 80 or port 443 or icmp' 2>&1
  echo "Capture complete: $outfile"
  echo "Inspect retransmissions with: tshark -r $outfile -Y 'tcp.analysis.retransmission'"
  echo "Inspect ICMP frag-needed with: tshark -r $outfile -Y 'icmp.type==3 && icmp.code==4'"
}

case "${1:-}" in
  decisive) sec_decisive ;;
  all)
    sec_decisive; sec_bridge; sec_mtu; sec_dns; sec_routing; sec_daemon; sec_compare
    echo
    echo "Skipped: packet capture (run './ci-docker-network-diagnostics.sh capture' explicitly"
    echo "while a build is stalling — it needs to be timed against a live stall to be useful)."
    ;;
  bridge)   sec_bridge ;;
  mtu)      sec_mtu ;;
  dns)      sec_dns ;;
  routing)  sec_routing ;;
  daemon)   sec_daemon ;;
  compare)  sec_compare ;;
  capture)  shift; sec_capture "$@" ;;
  *)
    echo "Usage: $0 {decisive|all|bridge|mtu|dns|routing|daemon|compare|capture [iface] [seconds]}"
    exit 1
    ;;
esac
