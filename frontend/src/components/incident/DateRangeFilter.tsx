import React from 'react';
import { Box, TextField, Button, ButtonGroup } from '@mui/material';

export interface DateRange {
  from?: string;
  to?: string;
}

interface Preset {
  label: string;
  getRange: () => DateRange;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const PRESETS: Preset[] = [
  {
    label: '30D',
    getRange: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return { from: isoDate(from), to: isoDate(to) };
    },
  },
  {
    label: '90D',
    getRange: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      return { from: isoDate(from), to: isoDate(to) };
    },
  },
  {
    label: 'YTD',
    getRange: () => {
      const to = new Date();
      const from = new Date(to.getFullYear(), 0, 1);
      return { from: isoDate(from), to: isoDate(to) };
    },
  },
  {
    label: 'All',
    getRange: () => ({ from: undefined, to: undefined }),
  },
];

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
      <ButtonGroup size="small" variant="outlined">
        {PRESETS.map((preset) => (
          <Button key={preset.label} onClick={() => onChange(preset.getRange())}>
            {preset.label}
          </Button>
        ))}
      </ButtonGroup>
      <TextField
        type="date"
        size="small"
        label="From"
        value={value.from || ''}
        onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 160 }}
      />
      <TextField
        type="date"
        size="small"
        label="To"
        value={value.to || ''}
        onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 160 }}
      />
    </Box>
  );
};
