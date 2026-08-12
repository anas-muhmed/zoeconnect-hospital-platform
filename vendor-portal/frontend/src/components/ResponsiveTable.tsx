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
 * mirrors frontend/src/components/ResponsiveTable.tsx (the hospital app's
 * equivalent). The responsiveness audit found 7 of this app's 9 list pages
 * (requests, licenses, history, logs, cloud-tenants, hdsp-users, security)
 * with a plain <Table> in a <Card>, no overflow handling at all -- on any
 * viewport narrower than the table's natural width, columns either clip or
 * drag the entire page (including the header) sideways.
 *
 * Usage: wrap whatever currently sits directly around your <Table> --
 *   <Card><Table>...</Table></Card>
 * becomes
 *   <Card><ResponsiveTable minWidth={900}><Table>...</Table></ResponsiveTable></Card>
 * The <Table> itself and everything inside it is untouched -- only the
 * scroll container changes.
 *
 * This does NOT add a mobile card/stacked-list fallback -- see
 * `hospitals/page.tsx`'s existing `useMediaQuery`-driven compact mode
 * (column hiding + a single "more actions" menu below `md`) for the one
 * example of that pattern already in this app; extending it to the other
 * 7 tables is Phase 3 work, not this pass.
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
