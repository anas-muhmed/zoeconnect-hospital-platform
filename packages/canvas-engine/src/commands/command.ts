/**
 * Command — the sole write path into a SceneGraph (ADR-004: "React ... writes
 * only via Command dispatch, never direct mutation"). Milestone 2 ships the
 * base Command/CommandHistory contract plus the handful of concrete commands
 * needed to prove draw/move/resize/delete/undo/redo. The richer
 * SerializableCommand / TransactionCommand variants (macro recording, grouped
 * multi-node edits) are Milestone 5B scope (Phase 5B §1.1/§1.2) — deliberately
 * not built here.
 */
export interface Command {
  /** Human-readable label, e.g. for a future history panel. */
  readonly name: string;
  execute(): void;
  undo(): void;
}
