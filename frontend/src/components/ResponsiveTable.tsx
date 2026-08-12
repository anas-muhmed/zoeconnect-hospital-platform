'use client';

import Box from '@mui/material/Box';

export interface ResponsiveTableProps {
  children: React.ReactNode;
  /**
   * CSS min-width applied to the inner <table>, so columns get a chance to
   * breathe before horizontal scroll kicks in, rather than collapsing to
   * unreadable widths first. Tune per table based on its column count.
   */
  minWidth?: number | string;
  /** Cap the table's height and scroll rows vertically -- pair with `stickyHeader` on your <Table> for a sticky header inside. */
  maxHeight?: number | string;
  className?: string;
}

/**
 * Drop-in scroll container for MUI <Table>s. Phase 1 responsive primitive --
 * the responsiveness audit found roughly a dozen tables across this app
 * with either no scroll wrapper at all (content silently clipped or
 * dragging the whole page sideways) or a bare `overflowX: 'auto'` Box
 * duplicated ad hoc per page with no consistent touch-scroll or
 * min-width handling.
 *
 * Usage: wrap whatever currently sits directly around your <Table> --
 *   <TableContainer><Table>...</Table></TableContainer>
 *   <Box sx={{ overflowX: 'auto' }}><Table>...</Table></Box>
 *   <Paper><Table>...</Table></Paper>  (no scroll handling at all -- this
 *     one is the actively-broken case, e.g. cms/monitoring/page.tsx's
 *     `overflow: 'hidden'` Paper, which clips columns instead of scrolling)
 * become
 *   <ResponsiveTable minWidth={900}><Table>...</Table></ResponsiveTable>
 * The <Table> itself, its head/body/rows/cells, and all business logic
 * inside them are untouched -- only the scroll container changes.
 *
 * This does NOT add a mobile card/stacked-list fallback -- it makes
 * horizontal scroll actually work and be reasonably discoverable
 * (visible thin scrollbar, touch-scroll momentum), which is the safe,
 * mechanical fix for now. A true card-view fallback needs per-table
 * column-priority decisions and is Phase 3 work, not this pass.
 */
export default function ResponsiveTable({ children, minWidth = 640, maxHeight, className }: ResponsiveTableProps) {
  return (
    <Box
      className={className}
      role="region"
      aria-label="Scrollable table"
      tabIndex={0}
      sx={{
        overflowX: 'auto',
        overflowY: maxHeight ? 'auto' : undefined,
        maxHeight,
        WebkitOverflowScrolling: 'touch',
        '&::-webkit-scrollbar': { height: 7, width: 7 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 4 },
        '&::-webkit-scrollbar-track': { bgcolor: 'rgba(0,0,0,0.04)' },
        '& table': { minWidth },
      }}
    >
      {children}
    </Box>
  );
}
