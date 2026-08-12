#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Set up / Reuse Persistent Docker Buildx Builder
#
# Extracted from .gitea/workflows/deploy.yml's build-images job (2026-08),
# so the registry-repair job (which also needs a working Buildx builder to
# rebuild a single service whose carried-forward image tag went missing
# from the registry -- see .gitea/scripts/build-and-push-image.sh and the
# "Registry repair" job for the full story) can call the EXACT SAME setup
# logic instead of duplicating it. This is a pure relocation: every
# comment, every safeguard, zero logic changes from the original inline
# step.
#
# Reuses a named builder ("gitea-persistent-builder") instead of letting
# setup-buildx-action create a brand-new anonymous docker-container
# builder on every run. If the underlying Gitea runner host is persistent
# (i.e. the docker daemon and its volumes survive between job runs),
# `docker buildx inspect` below will find the existing builder and its
# accumulated BuildKit cache/mount state instead of bootstrapping a fresh
# one -- the diagnostics right after print exactly which case happened, so
# this can be confirmed from real run logs instead of assumed.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
docker buildx install || true

# ── Network-mode drift check ────────────────────────────────────
# ROOT CAUSE (confirmed via A/B test, see CI_BUILD_PERFORMANCE_INVESTIGATION.md
# section 7): the docker-container driver runs buildkitd inside its
# OWN container with its OWN network namespace. `--driver-opt
# network=host` below only takes effect at `create` time. Once the
# builder exists, every later run hits the "reuse" branch and just
# reattaches to whatever container is already there — its network
# mode is frozen at whatever it was when first created, and Docker
# does not allow changing a running container's network mode
# in-place. If this builder container was ever created without
# network=host (e.g. before this flag was added, or via a raced
# `create` from a concurrent matrix job that dropped the flag),
# every push routed through BuildKit's native --push path silently
# runs over the container bridge network instead of the host
# network — a different, less reliable path to git.zoeconnect.in
# than the host-network path classic `docker push` and `buildx
# --load` + `docker push` use (confirmed in the A/B test: both
# host-network paths succeed in 2-3s, BuildKit's native push over
# the bridge path hangs 200-850s on the OAuth token fetch before
# timing out). This check makes the builder self-healing: on every
# run it verifies the *actual* container network mode and forces a
# recreate if it ever drifted off "host", instead of trusting that
# the create-time flag is still in effect.
# HIGH FIX: the read (`buildx inspect`) -> decide (NEEDS_RECREATE)
# -> act (`buildx rm` + `buildx create`) sequence below is not
# atomic by itself. With `max-parallel: 2`, two matrix jobs can
# enter this step around the same time; without a lock, both
# could observe "needs recreate" before either acts, or one job's
# `buildx rm` could remove the builder while a DIFFERENT job's
# "Build and Push Image" step (a separate script invocation) is
# actively mid-build against it — matrix jobs interleave
# arbitrarily on this shared runner, they aren't confined to
# running the same step at the same time. An EXCLUSIVE flock
# around this whole detect+act block serializes it against any
# other job doing the same; a matching SHARED flock around the
# actual `docker buildx build` call in the "Build and Push Image"
# step (same lock file) means this exclusive block also waits for
# any in-flight builds to finish before recreating, and blocks
# any new build from starting while a recreate is in progress —
# while still letting any number of builds run fully concurrently
# against each other, since shared locks never block other shared
# locks. `-w 120` bounds the wait so a stuck lock fails loudly
# instead of hanging the job forever.
#
# The registry-repair job's own call into this script participates in
# the SAME lock file/same builder name -- it is never able to race a
# concurrent build-images matrix job for real, since registry-repair's
# `needs: [detect-changes, build-images]` guarantees build-images has
# already fully finished (success or skipped) before registry-repair's
# steps ever start. The lock still matters for two registry-repair
# service-repairs running one after another in the same job, and as a
# defensive guarantee regardless of job ordering.
BUILDER_LOCKFILE="/tmp/gitea-buildx-builder.lock"
(
  flock -x -w 120 200 || { echo "ERROR: could not acquire exclusive builder lock within 120s — another job may be stuck holding it. Aborting builder setup."; exit 1; }
  echo "🔒 Exclusive builder lock acquired for setup/recreate."

  NEEDS_RECREATE=false
  if docker buildx inspect gitea-persistent-builder >/dev/null 2>&1; then
    BUILDKIT_CONTAINER=$(docker ps -a --filter "name=buildx_buildkit_gitea-persistent-builder" --format '{{.Names}}' | head -1)
    if [ -n "$BUILDKIT_CONTAINER" ]; then
      ACTUAL_NETMODE=$(docker inspect "$BUILDKIT_CONTAINER" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null || echo "unknown")
      echo "Existing builder container '$BUILDKIT_CONTAINER' network mode: $ACTUAL_NETMODE"
      if [ "$ACTUAL_NETMODE" != "host" ]; then
        echo "⚠️  Builder is NOT on host network (mode=$ACTUAL_NETMODE) — this is the confirmed root cause of BuildKit native-push hangs/timeouts. Forcing recreate on host network (cache will be cold this run only)."
        NEEDS_RECREATE=true
      else
        echo "✅ Builder is already on host network — no recreate needed."
      fi
    else
      echo "⚠️  'gitea-persistent-builder' is registered with buildx but its container is missing/not found — forcing recreate."
      NEEDS_RECREATE=true
    fi
  else
    echo "🆕 No existing 'gitea-persistent-builder' found — bootstrapping a new one (cache will be cold this run)."
    NEEDS_RECREATE=true
  fi

  if [ "$NEEDS_RECREATE" = "true" ]; then
    docker buildx rm gitea-persistent-builder >/dev/null 2>&1 || true
    # Now protected by the exclusive lock above, so two setup
    # steps can no longer race each other into this branch
    # simultaneously. Kept as a defensive fallback only — e.g. a
    # completely different workflow/lock-unaware process touching
    # the same builder name would still be handled gracefully
    # rather than crashing this job.
    docker buildx create \
      --name gitea-persistent-builder \
      --driver docker-container \
      --driver-opt network=host \
      --buildkitd-flags '--oci-max-parallelism=2' \
      || echo "Builder creation raced with a process outside this lock — will use the one that won."
  else
    echo "♻️  Reusing existing named builder 'gitea-persistent-builder' (cache/mount state should carry over from previous runs)."
  fi
  docker buildx use gitea-persistent-builder
  docker buildx inspect --bootstrap
  echo "── Confirming final network mode ──"
  FINAL_CONTAINER=$(docker ps -a --filter "name=buildx_buildkit_gitea-persistent-builder" --format '{{.Names}}' | head -1)
  if [ -n "$FINAL_CONTAINER" ]; then
    docker inspect "$FINAL_CONTAINER" --format 'Builder container: {{.Name}}  NetworkMode: {{.HostConfig.NetworkMode}}'
  fi
) 200>"$BUILDER_LOCKFILE"
echo "🔓 Builder lock released."
