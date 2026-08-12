import React, { useState, useEffect, useRef } from 'react';
import { Autocomplete, TextField, CircularProgress, Box, Typography } from '@mui/material';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { incidentApi } from '@/lib/api/incident.api';
import { getApiErrorMessage } from '@/lib/utils/api-error';

interface Employee {
  id: string; // Could be HIS ID or ZoeConnect User ID
  name: string;
  department?: string;
  role?: string;
}

interface EmployeeLookupProps {
  value: Employee | null;
  onChange: (value: Employee | null) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
}

export const EmployeeLookup: React.FC<EmployeeLookupProps> = ({
  value,
  onChange,
  label = 'Search Employee',
  error,
  helperText,
}) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<readonly Employee[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasLoadedDefaults = useRef(false);

  // Debounce the input value to avoid spamming the API
  const debouncedInput = useDebounce(inputValue, 500);

  const runSearch = (term: string) => {
    let active = true;
    setLoading(true);
    setFetchError(null);

    incidentApi.searchEmployees(term)
      .then((results) => {
        if (active) setOptions(results || []);
      })
      .catch((err) => {
        if (active) {
          console.error('Employee search failed', err);
          setFetchError(getApiErrorMessage(err, 'Could not load employees. Try again.'));
          setOptions(value ? [value] : []);
          hasLoadedDefaults.current = false; // allow retry on next open
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  };

  // Typed search (2+ characters)
  useEffect(() => {
    if (debouncedInput.length < 2) {
      if (!open || options.length === 0) setOptions(value ? [value] : []);
      return undefined;
    }
    return runSearch(debouncedInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debouncedInput]);

  // Default list on open, before the user has typed anything — otherwise the
  // dropdown just opens empty with no indication whether that's "no results"
  // or "you need to type first."
  useEffect(() => {
    if (open && inputValue.length < 2 && !hasLoadedDefaults.current) {
      hasLoadedDefaults.current = true;
      return runSearch('');
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Autocomplete
      id="employee-lookup"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      getOptionLabel={(option) => option.name}
      options={options}
      loading={loading}
      value={value}
      noOptionsText={fetchError || (inputValue.length > 0 && inputValue.length < 2 ? 'Keep typing…' : 'No employees found')}
      onChange={(event: any, newValue: Employee | null) => {
        onChange(newValue);
      }}
      onInputChange={(event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box>
            <Typography variant="body1">{option.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.department} {option.role ? `• ${option.role}` : ''}
            </Typography>
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error || !!fetchError}
          helperText={fetchError || helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <React.Fragment>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </React.Fragment>
            ),
          }}
        />
      )}
    />
  );
};
