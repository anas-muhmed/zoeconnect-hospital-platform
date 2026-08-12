#!/usr/bin/env node
/**
 * Backend/Connector compatibility check (Phase 12, Task 12.5 — "enforced",
 * not just "published").
 *
 * Usage: node check-compatibility.js <hdsp-backend-version> [connector-version]
 *
 * If `connector-version` is omitted, this only validates that
 * `connector/COMPATIBILITY.json` has a matrix row whose
 * `compatibleBackendVersionRange` covers the given backend version (a
 * build-time / pre-deploy check). If `connector-version` IS supplied
 * (install.sh passes it when the self-hosted connector-relay variant is
 * enabled, after reading it from a running Connector's own `/health`
 * payload -- see health.ts's `connectorVersion` field, added this same
 * phase), this also checks that specific Connector build satisfies
 * `minCompatibleConnectorVersion`, catching a real runtime mismatch
 * (e.g. an operator who pulled a stale Connector image), not just a
 * config-file claim.
 *
 * Deliberately dependency-free (no semver package) — the version scheme in
 * play (X.Y.x range strings in COMPATIBILITY.json, X.Y.Z elsewhere) is
 * simple enough that a small hand-rolled comparison is clearer than adding
 * a dependency to a script that also has to run inside the backend
 * container with no guaranteed node_modules beyond what's already bundled.
 */

const fs = require('fs');
const path = require('path');

function parseVersion(v) {
  const [major, minor, patch] = v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  return { major, minor, patch };
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

// Matches "1.0.x" / "1.x" style ranges against a concrete version, by
// comparing only the non-'x' components.
function matchesRange(version, range) {
  const vParts = version.replace(/^v/, '').split('.');
  const rParts = range.split('.');
  for (let i = 0; i < rParts.length; i += 1) {
    if (rParts[i] === 'x') continue;
    if (vParts[i] !== rParts[i]) return false;
  }
  return true;
}

function main() {
  const [, , backendVersion, connectorVersion] = process.argv;
  if (!backendVersion) {
    console.error('Usage: check-compatibility.js <hdsp-backend-version> [connector-version]');
    process.exit(2);
  }

  const compatPath = path.join(__dirname, '..', '..', 'connector', 'COMPATIBILITY.json');
  const compat = JSON.parse(fs.readFileSync(compatPath, 'utf-8'));

  const matchingRow = compat.matrix.find((row) => matchesRange(backendVersion, row.compatibleBackendVersionRange));
  if (!matchingRow) {
    console.error(`No compatibility matrix row covers backend version ${backendVersion}. See connector/COMPATIBILITY.json.`);
    process.exit(1);
  }
  console.log(`Backend ${backendVersion} is covered by matrix row: connector ${matchingRow.connectorVersionRange}, protocol v${matchingRow.protocolVersion}.`);

  if (connectorVersion) {
    if (compareVersions(connectorVersion, compat.minCompatibleConnectorVersion) < 0) {
      console.error(`Connector version ${connectorVersion} is older than minCompatibleConnectorVersion ${compat.minCompatibleConnectorVersion}. Upgrade the Connector before proceeding.`);
      process.exit(1);
    }
    if (!matchesRange(connectorVersion, matchingRow.connectorVersionRange)) {
      console.error(`Connector version ${connectorVersion} does not match the expected range ${matchingRow.connectorVersionRange} for backend ${backendVersion}.`);
      process.exit(1);
    }
    console.log(`Connector ${connectorVersion} is compatible with backend ${backendVersion}.`);
  }

  process.exit(0);
}

main();
