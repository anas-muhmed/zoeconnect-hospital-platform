'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import { hisApi, type HisSearchResult } from '@/lib/api/his.api';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface PatientSearchProps {
  onSelect: (patient: HisSearchResult) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  value?: string;         // controlled display value (e.g., selected patient name)
}

const GENDER_LABEL: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

export default function PatientSearch({
  onSelect,
  label = 'Search Patient',
  placeholder = 'MRN, name or mobile…',
  disabled = false,
  value,
}: PatientSearchProps) {
  const [inputVal, setInputVal] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const debouncedQ = useDebounce(inputVal, 400);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: results, isFetching } = useQuery({
    queryKey: ['his-search', debouncedQ],
    queryFn: () => hisApi.searchPatients(debouncedQ),
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 60_000,
  });

  const handleSelect = (patient: HisSearchResult) => {
    setInputVal(`${patient.fullName} (${patient.mrn})`);
    setOpen(false);
    onSelect(patient);
  };

  const ageLabel = (dob: string): string => {
    const years = Math.floor(
      (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
    );
    return `${years}y`;
  };

  return (
    <Box ref={containerRef} sx={{ position: 'relative' }}>
      <TextField
        label={label}
        placeholder={placeholder}
        fullWidth
        size="small"
        disabled={disabled}
        value={inputVal}
        onChange={(e) => {
          setInputVal(e.target.value);
          setOpen(true);
        }}
        onFocus={() => debouncedQ.length >= 2 && setOpen(true)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              {isFetching
                ? <CircularProgress size={16} />
                : <SearchIcon fontSize="small" color="action" />
              }
            </InputAdornment>
          ),
        }}
      />

      {open && (results?.length ?? 0) > 0 && (
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            zIndex: 1400,
            width: '100%',
            maxHeight: 320,
            overflow: 'auto',
            mt: 0.5,
          }}
        >
          <List dense disablePadding>
            {results!.map((p) => (
              <ListItemButton
                key={p.mrn}
                onClick={() => handleSelect(p)}
                divider
              >
                <ListItemAvatar>
                  <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13 }}>
                    <PersonIcon fontSize="small" />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {p.fullName}
                      </Typography>
                      <Chip label={p.mrn} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {GENDER_LABEL[p.gender] ?? p.gender} · {ageLabel(p.dateOfBirth)}
                      {p.mobile ? ` · ${p.mobile}` : ''}
                    </Typography>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {open && debouncedQ.length >= 2 && !isFetching && (results?.length ?? 0) === 0 && (
        <Paper
          elevation={4}
          sx={{ position: 'absolute', zIndex: 1400, width: '100%', p: 2, mt: 0.5 }}
        >
          <Typography variant="body2" color="text.secondary" align="center">
            No patients found for "{debouncedQ}"
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
