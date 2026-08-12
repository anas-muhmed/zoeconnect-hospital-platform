'use client';

import { createTheme, ThemeProvider as MuiThemeProvider, alpha } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ReactNode, useMemo } from 'react';

// ── Slate Enterprise palette ──────────────────────────────────────────────────
const C = {
  // Core blues
  blue:     '#2563EB',   // electric blue — primary action
  blueDk:   '#1D4ED8',   // hover / pressed
  blueLt:   '#3B82F6',   // lighter variant
  blueXlt:  '#EFF6FF',   // tint bg

  // Purples — secondary accent
  purple:   '#7C3AED',
  purpleLt: '#8B5CF6',
  purpleXlt:'#F5F3FF',

  // Backgrounds
  bg:       '#F1F4F9',   // cool grey page bg
  bgAlt:    '#E8EDF5',   // slightly darker section bg
  paper:    '#FFFFFF',

  // Sidebar / app shell
  shell:    '#0F172A',   // near-black slate
  shellMid: '#1E293B',   // mid-tone sidebar
  shellLt:  '#334155',   // hover on sidebar

  // Text
  ink:      '#0F172A',   // heading text
  slate:    '#1E293B',   // body text
  muted:    '#475569',   // secondary text
  faint:    '#94A3B8',   // placeholder / disabled

  // Semantic
  green:    '#059669',
  greenLt:  '#D1FAE5',
  red:      '#DC2626',
  redLt:    '#FEE2E2',
  amber:    '#D97706',
  amberLt:  '#FEF3C7',
  info:     '#0284C7',
  infoLt:   '#E0F2FE',

  // Borders
  border:      '#E2E8F0',
  borderHover: '#CBD5E1',
} as const;

// ── Theme ─────────────────────────────────────────────────────────────────────
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main:        C.blue,
      dark:        C.blueDk,
      light:       C.blueLt,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main:        C.purple,
      light:       C.purpleLt,
      contrastText: '#FFFFFF',
    },
    background: {
      default: C.bg,
      paper:   C.paper,
    },
    text: {
      primary:   C.ink,
      secondary: C.muted,
      disabled:  C.faint,
    },
    divider: C.border,
    success: { main: C.green,  light: C.greenLt,  contrastText: '#fff' },
    error:   { main: C.red,    light: C.redLt,    contrastText: '#fff' },
    warning: { main: C.amber,  light: C.amberLt,  contrastText: '#fff' },
    info:    { main: C.info,   light: C.infoLt,   contrastText: '#fff' },
  },

  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    fontWeightRegular: 400,
    fontWeightMedium:  500,
    fontWeightBold:    700,
    h1: { fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.03em', color: C.ink },
    h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', color: C.ink },
    h3: { fontSize: '1.5rem',  fontWeight: 700, letterSpacing: '-0.02em',  color: C.ink },
    h4: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.015em', color: C.ink },
    h5: { fontSize: '1.125rem', fontWeight: 700, color: C.ink },
    h6: { fontSize: '1rem',    fontWeight: 700, color: C.ink },
    subtitle1: { fontSize: '0.9375rem', fontWeight: 600, color: C.slate },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 600, color: C.muted },
    body1: { fontSize: '0.9375rem', color: C.slate, lineHeight: 1.6 },
    body2: { fontSize: '0.875rem',  color: C.muted, lineHeight: 1.6 },
    caption: { fontSize: '0.75rem', color: C.faint },
    overline: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', color: C.faint },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
  },

  shape: { borderRadius: 10 },

  shadows: [
    'none',
    '0 1px 2px rgba(15,23,42,0.06)',
    '0 1px 4px rgba(15,23,42,0.08)',
    '0 2px 8px rgba(15,23,42,0.09)',
    '0 4px 12px rgba(15,23,42,0.10)',
    '0 6px 16px rgba(15,23,42,0.11)',
    '0 8px 20px rgba(15,23,42,0.12)',
    '0 10px 24px rgba(15,23,42,0.13)',
    '0 12px 28px rgba(15,23,42,0.14)',
    '0 14px 32px rgba(15,23,42,0.15)',
    '0 16px 36px rgba(15,23,42,0.15)',
    '0 18px 40px rgba(15,23,42,0.15)',
    '0 20px 44px rgba(15,23,42,0.16)',
    '0 22px 48px rgba(15,23,42,0.16)',
    '0 24px 52px rgba(15,23,42,0.17)',
    '0 26px 56px rgba(15,23,42,0.17)',
    '0 28px 60px rgba(15,23,42,0.18)',
    '0 30px 64px rgba(15,23,42,0.18)',
    '0 32px 68px rgba(15,23,42,0.19)',
    '0 34px 72px rgba(15,23,42,0.19)',
    '0 36px 76px rgba(15,23,42,0.20)',
    '0 38px 80px rgba(15,23,42,0.20)',
    '0 40px 84px rgba(15,23,42,0.20)',
    '0 42px 88px rgba(15,23,42,0.20)',
    '0 44px 92px rgba(15,23,42,0.20)',
  ] as any,

  components: {
    // ── Global resets ────────────────────────────────────────────────────────
    MuiCssBaseline: {
      styleOverrides: `
        *, *::before, *::after { box-sizing: border-box; }
        html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.borderHover}; border-radius: 8px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.muted}; }
      `,
    },

    // ── AppBar — frosted glass ────────────────────────────────────────────────
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${C.border}`,
          boxShadow: 'none',
          color: C.ink,
        },
      },
    },

    // ── Drawer — deep slate sidebar ───────────────────────────────────────────
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: `linear-gradient(175deg, ${C.shell} 0%, ${C.shellMid} 60%, #162032 100%)`,
          borderRight: 'none',
          boxShadow: '4px 0 24px rgba(15,23,42,0.25)',
        },
      },
    },

    // ── Card ─────────────────────────────────────────────────────────────────
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          backgroundColor: C.paper,
          transition: 'box-shadow 0.2s, transform 0.2s',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(37,99,235,0.10)',
          },
        },
      },
    },

    // ── Paper ─────────────────────────────────────────────────────────────────
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 12, backgroundImage: 'none' },
        outlined: { borderColor: C.border },
        elevation1: { boxShadow: '0 1px 4px rgba(15,23,42,0.08)' },
        elevation2: { boxShadow: '0 2px 8px rgba(15,23,42,0.10)' },
      },
    },

    // ── Button ────────────────────────────────────────────────────────────────
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontSize: '0.875rem',
          padding: '7px 18px',
          transition: 'background 0.15s, transform 0.1s, box-shadow 0.15s',
        },
        contained: {
          background: `linear-gradient(135deg, ${C.blue} 0%, ${C.blueDk} 100%)`,
          boxShadow: `0 2px 8px ${alpha(C.blue, 0.30)}`,
          '&:hover': {
            background: `linear-gradient(135deg, ${C.blueLt} 0%, ${C.blue} 100%)`,
            boxShadow: `0 4px 14px ${alpha(C.blue, 0.40)}`,
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: C.border,
          color: C.slate,
          '&:hover': {
            borderColor: C.blue,
            color: C.blue,
            background: C.blueXlt,
          },
        },
        text: {
          color: C.slate,
          '&:hover': { background: C.bg },
        },
        sizeSmall: { padding: '4px 12px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '10px 24px', fontSize: '0.9375rem' },
      },
    },

    // ── IconButton ────────────────────────────────────────────────────────────
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'background 0.15s, color 0.15s',
          '&:hover': { background: C.bg },
        },
      },
    },

    // ── TextField ─────────────────────────────────────────────────────────────
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: C.paper,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.borderHover },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: C.blue,
            borderWidth: 2,
          },
        },
      },
    },

    // ── Table ─────────────────────────────────────────────────────────────────
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            backgroundColor: C.bg,
            color: C.muted,
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            borderBottom: `1px solid ${C.border}`,
            padding: '10px 16px',
            whiteSpace: 'nowrap',
          },
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          '& .MuiTableRow-root': {
            transition: 'background 0.1s',
            '&:hover': { backgroundColor: alpha(C.blue, 0.03) },
            '&:last-child .MuiTableCell-root': { borderBottom: 'none' },
          },
          '& .MuiTableCell-root': {
            borderBottom: `1px solid ${C.border}`,
            padding: '10px 16px',
            fontSize: '0.875rem',
            color: C.slate,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },

    // ── Chip ──────────────────────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: '0.75rem', borderRadius: 6 },
        colorSuccess: { backgroundColor: C.greenLt, color: C.green },
        colorError:   { backgroundColor: C.redLt,   color: C.red   },
        colorWarning: { backgroundColor: C.amberLt,  color: C.amber },
        colorInfo:    { backgroundColor: C.infoLt,   color: C.info  },
        colorPrimary: { backgroundColor: C.blueXlt,  color: C.blue  },
        colorSecondary: { backgroundColor: C.purpleXlt, color: C.purple },
      },
    },

    // ── Tabs ──────────────────────────────────────────────────────────────────
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: '0.875rem',
          textTransform: 'none',
          color: C.muted,
          minHeight: 44,
          '&.Mui-selected': { color: C.blue },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: C.blue, height: 2, borderRadius: 2 },
      },
    },

    // ── Accordion ─────────────────────────────────────────────────────────────
    MuiAccordion: {
      styleOverrides: {
        root: {
          border: `1px solid ${C.border}`,
          borderRadius: '12px !important',
          '&:before': { display: 'none' },
          boxShadow: 'none',
        },
      },
    },

    // ── Dialog ────────────────────────────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16, boxShadow: '0 20px 60px rgba(15,23,42,0.20)' },
      },
    },

    // ── Tooltip ───────────────────────────────────────────────────────────────
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: {
          backgroundColor: C.shell,
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 6,
          padding: '5px 10px',
        },
        arrow: { color: C.shell },
      },
    },

    // ── Breadcrumbs ───────────────────────────────────────────────────────────
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: { color: C.faint },
      },
    },

    // ── LinearProgress ────────────────────────────────────────────────────────
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, backgroundColor: C.border },
        bar: { borderRadius: 4 },
      },
    },

    // ── Alert ─────────────────────────────────────────────────────────────────
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, fontWeight: 500, fontSize: '0.875rem' },
      },
    },

    // ── ListItemButton ────────────────────────────────────────────────────────
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '1px 0',
          transition: 'background 0.15s',
        },
      },
    },
  },
});

// ── Provider ──────────────────────────────────────────────────────────────────
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
