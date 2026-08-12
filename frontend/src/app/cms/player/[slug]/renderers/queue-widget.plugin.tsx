'use client';

/**
 * Queue Widget -- Phase 5's flagship plugin. Shows live queue status
 * (waiting count, currently serving/called tokens, last called) for a
 * hospital location or service center, pulled directly from the existing
 * public, unauthenticated Token module endpoint:
 *
 *   GET /token/queue/state/:referenceType/:referenceId?limit=5
 *
 * The Token module is completely untouched -- this plugin is just another
 * client of its already-public API, exactly like a kiosk or display board
 * would be. No CMS<->Token schema coupling, no shared tables/files/routes.
 */

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import type { CMSRendererPlugin, ContentRendererProps, PluginConfigField } from './plugin-types';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? `${API_ORIGIN}/api/v1`;

export interface QueueWidgetConfig {
  title?: string;
  referenceType: 'LOCATION' | 'SERVICE_CENTER';
  referenceId: string;
  refreshSeconds?: number;
  theme?: 'blue' | 'green' | 'dark';
  showWaiting?: boolean;
  showServing?: boolean;
  showLastCalled?: boolean;
}

interface QueueState {
  waiting: number;
  waitingTokens: { id: string; fullToken: string; priority?: number }[];
  recentCalled: { id: string; fullToken: string; calledAt: string; counterId?: string | null }[];
}

const THEMES: Record<string, { bg: string; fg: string; accent: string }> = {
  blue: { bg: '#0b3d91', fg: '#ffffff', accent: '#4fc3f7' },
  green: { bg: '#1b5e20', fg: '#ffffff', accent: '#81c784' },
  dark: { bg: '#111318', fg: '#ffffff', accent: '#9e9e9e' },
};

const DEFAULT_CONFIG: QueueWidgetConfig = {
  title: 'Queue Status',
  referenceType: 'SERVICE_CENTER',
  referenceId: '',
  refreshSeconds: 5,
  theme: 'blue',
  showWaiting: true,
  showServing: true,
  showLastCalled: true,
};

function QueueWidgetRenderer({ item, onAdvance }: ContentRendererProps) {
  const cfg: QueueWidgetConfig = { ...DEFAULT_CONFIG, ...(item.configuration as Partial<QueueWidgetConfig> | null ?? {}) };
  const theme = THEMES[cfg.theme ?? 'blue'] ?? THEMES.blue;
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (!cfg.referenceId) { setError('Queue Widget is not configured yet'); return; }
      try {
        const res = await fetch(`${API_BASE}/token/queue/state/${cfg.referenceType}/${encodeURIComponent(cfg.referenceId)}?limit=5`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: QueueState = await res.json();
        if (!cancelled) { setState(data); setError(null); }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load queue status');
      }
    };
    poll();
    const interval = setInterval(poll, Math.max(2, cfg.refreshSeconds ?? 5) * 1000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.referenceType, cfg.referenceId, cfg.refreshSeconds]);

  // Widgets still occupy a slot in the playlist loop -- advance after the item's configured duration.
  useEffect(() => {
    const seconds = item.durationSeconds ?? 15;
    const timer = setTimeout(onAdvance, seconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId]);

  const lastCalled = state?.recentCalled?.[0] ?? null;
  const nowServing = state?.recentCalled?.filter(c => !!c.counterId) ?? [];

  return (
    <Box sx={{
      width: '100%', height: '100%', bgcolor: theme.bg, color: theme.fg,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      p: 6, textAlign: 'center',
    }}>
      <Typography variant="h3" fontWeight={700} sx={{ mb: 4, color: theme.accent }}>
        {cfg.title || 'Queue Status'}
      </Typography>

      {error && !state && (
        <Typography variant="h6" sx={{ opacity: 0.8 }}>{error}</Typography>
      )}

      {state && (
        <Box sx={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          {cfg.showWaiting && (
            <Box>
              <Typography variant="h1" fontWeight={800}>{state.waiting}</Typography>
              <Typography variant="h6" sx={{ opacity: 0.85 }}>Waiting</Typography>
            </Box>
          )}
          {cfg.showServing && nowServing.length > 0 && (
            <Box>
              <Typography variant="h2" fontWeight={800} color={theme.accent}>{nowServing[0].fullToken}</Typography>
              <Typography variant="h6" sx={{ opacity: 0.85 }}>Now Serving</Typography>
            </Box>
          )}
          {cfg.showLastCalled && lastCalled && (
            <Box>
              <Chip
                label={`Last Called: ${lastCalled.fullToken}`}
                sx={{ bgcolor: theme.accent, color: theme.bg, fontSize: 20, py: 3, px: 1, fontWeight: 700 }}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

const CONFIG_SCHEMA: PluginConfigField[] = [
  { key: 'title', label: 'Display Title', type: 'text', defaultValue: 'Queue Status', helperText: 'e.g. "Reception Queue"' },
  {
    key: 'referenceType', label: 'Reference Type', type: 'select', defaultValue: 'SERVICE_CENTER',
    options: [{ value: 'SERVICE_CENTER', label: 'Service Center' }, { value: 'LOCATION', label: 'Location' }],
  },
  { key: 'referenceId', label: 'Location / Service Center ID', type: 'text', helperText: 'The HIS service center id or token location id' },
  { key: 'refreshSeconds', label: 'Refresh Interval (s)', type: 'number', defaultValue: 5, helperText: 'Every N seconds' },
  {
    key: 'theme', label: 'Theme', type: 'select', defaultValue: 'blue',
    options: [{ value: 'blue', label: 'Hospital Blue' }, { value: 'green', label: 'Hospital Green' }, { value: 'dark', label: 'Dark' }],
  },
  { key: 'showWaiting', label: 'Show Waiting Count', type: 'boolean', defaultValue: true },
  { key: 'showServing', label: 'Show Currently Serving', type: 'boolean', defaultValue: true },
  { key: 'showLastCalled', label: 'Show Last Called', type: 'boolean', defaultValue: true },
];

export const queueWidgetPlugin: CMSRendererPlugin = {
  id: 'queue-widget',
  name: 'Queue Widget',
  icon: 'Queue',
  contentType: 'QUEUE_WIDGET',
  description: 'Live waiting/serving/last-called status for a hospital location or service center.',
  isWidget: true,
  configSchema: CONFIG_SCHEMA,
  validateConfig(config: unknown) {
    const errors: string[] = [];
    const c = (config ?? {}) as Partial<QueueWidgetConfig>;
    if (!c.referenceId) errors.push('Reference ID (location or service center) is required');
    if (c.referenceType && c.referenceType !== 'LOCATION' && c.referenceType !== 'SERVICE_CENTER') {
      errors.push('Reference Type must be LOCATION or SERVICE_CENTER');
    }
    if (c.refreshSeconds !== undefined && (typeof c.refreshSeconds !== 'number' || c.refreshSeconds < 2)) {
      errors.push('Refresh interval must be a number of at least 2 seconds');
    }
    return { valid: errors.length === 0, errors };
  },
  Component: QueueWidgetRenderer,
};
