import * as fs from 'fs';
import * as path from 'path';

/**
 * ADR-004 conformance check (see docs/architecture/CONFORMANCE_CHECKS.md #3):
 * @hdsp/canvas-engine must never depend on React or the DOM. This is enforced
 * here at the package.json level (Milestone 1) as the cheapest possible check;
 * a repo-wide dependency-cruiser rule per CONFORMANCE_CHECKS.md is expected to
 * subsume this once more packages exist.
 */
describe('ADR-004 — framework-agnostic canvas engine', () => {
  it('declares zero dependency on react or react-dom', () => {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(allDeps)).not.toEqual(
      expect.arrayContaining(['react', 'react-dom']),
    );
  });

  it('exposes the package version marker', () => {
    const { CANVAS_ENGINE_VERSION } = require('../index');
    expect(typeof CANVAS_ENGINE_VERSION).toBe('string');
  });
});
