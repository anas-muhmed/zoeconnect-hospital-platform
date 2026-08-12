#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CI Runner Diagnostics — manual investigation tool for the Gitea Actions
# runner host. NOT wired into .gitea/workflows/deploy.yml — run this by hand
# (SSH'd into the runner) to gather the exact data needed to tell whether the
# remaining build-time gap is CPU, memory, disk I/O, or external network
# latency, before making any further changes to the pipeline itself.
#
# Usage:
#   ./ci-runner-diagnostics.sh baseline
#     One-shot snapshot: CPU count, RAM, disk, and latency to the 4 domains
#     the pipeline actually talks to. Run this any time, doesn't need a
#     build in progress.
#
#   ./ci-runner-diagnostics.sh watch [interval_seconds] [output_file]
#     Continuous sampling loop (default: every 5s) of CPU/mem/docker stats/
#     disk I/O, each line timestamped. Start this in a second SSH session
#     just BEFORE triggering the next push to hybrid-architecture, let it
#     run for the whole pipeline, then Ctrl-C it once the build-images job
#     finishes. Correlate the timestamps against the --progress=plain build
#     log from that same run to see exactly what the host was doing during
#     the slow stages.
#
#   ./ci-runner-diagnostics.sh builder
#     One-shot: docker buildx ls / du for the persistent builder, plus
#     whether /tmp/.buildx-cache exists and its age — same checks the
#     workflow's own diagnostics steps print, for cross-checking by hand.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

section() { echo; echo "── $1 ──"; }

cmd_baseline() {
  section "CPU"
  nproc --all 2>/dev/null || grep -c ^processor /proc/cpuinfo
  echo "Load average:"; cat /proc/loadavg 2>/dev/null || uptime

  section "RAM"
  free -h

  section "Disk (space)"
  df -h /

  section "Disk (I/O — one-shot snapshot; run 'watch' mode for I/O under load)"
  if command -v iostat >/dev/null 2>&1; then
    iostat -x 1 2
  else
    echo "iostat not installed (sysstat package) — falling back to vmstat:"
    vmstat 1 2 2>/dev/null || echo "vmstat also unavailable — install sysstat: apt-get install -y sysstat"
  fi

  section "Network latency to the 4 domains this pipeline actually depends on"
  for url in https://deb.debian.org https://registry.npmjs.org https://github.com https://nodejs.org; do
    printf "%-32s " "$url"
    curl -o /dev/null -sS -w 'connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s http_code=%{http_code}\n' \
      --max-time 15 "$url" || echo "FAILED / TIMED OUT (>15s) — this alone may be your answer"
  done

  section "Docker / Buildx versions"
  docker --version 2>&1
  docker buildx version 2>&1

  echo
  echo "Baseline snapshot complete. If any of the 4 domains above show"
  echo "total= times over ~1-2s, or FAILED/TIMED OUT, that domain's install-"
  echo "time usage (apt -> deb.debian.org, npm -> registry.npmjs.org, bcrypt's"
  echo "fallback -> github.com/nodejs.org) is a live candidate for the build-time"
  echo "gap flagged in the investigation report, independent of CPU/RAM/disk."
}

cmd_builder() {
  section "Buildx builder instances"
  docker buildx ls

  section "Persistent builder disk usage"
  docker buildx du --builder gitea-persistent-builder 2>&1 || echo "(builder not found yet — has a build run since the workflow update?)"

  section "Local export-cache directory"
  if [ -d /tmp/.buildx-cache ]; then
    echo "/tmp/.buildx-cache exists, created: $(stat -c '%y' /tmp/.buildx-cache 2>/dev/null || stat -f '%Sm' /tmp/.buildx-cache)"
    du -sh /tmp/.buildx-cache 2>/dev/null
  else
    echo "/tmp/.buildx-cache does not exist right now."
  fi

  section "Running containers (is a build in progress right now?)"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
}

cmd_watch() {
  local interval="${1:-5}"
  local outfile="${2:-/tmp/ci-runner-watch-$(date +%Y%m%d-%H%M%S).log}"
  echo "Sampling every ${interval}s. Writing to: $outfile"
  echo "Ctrl-C to stop once the build-images job has finished."
  echo "ts,load1,mem_used_pct,swap_used_mb" > "$outfile.summary.csv"

  trap 'echo; echo "Stopped. Summary CSV: $outfile.summary.csv"; echo "Full log: $outfile"; exit 0' INT

  while true; do
    ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    {
      echo "===== $ts ====="
      echo "-- load --"; cat /proc/loadavg
      echo "-- mem --"; free -m
      echo "-- docker stats (no-stream) --"
      docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.BlockIO}}\t{{.NetIO}}' 2>&1
      echo "-- disk I/O (vmstat 1 2, last line = current) --"
      vmstat 1 2 2>/dev/null | tail -1
      echo
    } >> "$outfile"

    # Compact summary line for quick eyeballing without opening the full log
    load1=$(awk '{print $1}' /proc/loadavg)
    mem_line=$(free -m | awk '/^Mem:/ {printf "%.0f", ($3/$2)*100}')
    swap_used=$(free -m | awk '/^Swap:/ {print $3}')
    echo "$ts,$load1,$mem_line,$swap_used" >> "$outfile.summary.csv"
    printf "%s  load1=%-6s mem_used=%s%%  swap_used=%sMB\n" "$ts" "$load1" "$mem_line" "$swap_used"

    sleep "$interval"
  done
}

case "${1:-}" in
  baseline) cmd_baseline ;;
  builder)  cmd_builder ;;
  watch)    shift; cmd_watch "$@" ;;
  *)
    echo "Usage: $0 {baseline|builder|watch [interval_seconds] [output_file]}"
    exit 1
    ;;
esac
