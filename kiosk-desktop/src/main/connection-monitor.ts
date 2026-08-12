/**
 * SUPERSEDED -- kept only because this sandbox's filesystem mount would
 * not permit deleting the file outright (a real checkout should just `git
 * rm` it). Do not import from this module.
 *
 * Reachability polling now lives in heartbeat-service.ts's
 * HeartbeatService, which folds "is the server up" and "does the backend
 * consider this device online/disabled/revoked" into the single
 * POST /kiosk/heartbeat call every 30s, instead of running this separate
 * plain-reachability timer alongside it. See heartbeat-service.ts's doc
 * comment for the full rationale.
 */
export {};
