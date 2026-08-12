import React, { useState, useEffect, useRef } from 'react';
import { Autocomplete, TextField, CircularProgress, Box, Typography, Chip } from '@mui/material';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { incidentApi } from '@/lib/api/incident.api';
import { getApiErrorMessage } from '@/lib/utils/api-error';

interface Employee {
  id: string; // Could be HIS ID or ZoeConnect User ID
  name: string;
  department?: string;
  role?: string;
}

interface EmployeeMultiLookupProps {
  value: Employee[];
  onChange: (value: Employee[]) => void;
  label?: string;
  helperText?: string;
}

/**
 * Multi-select variant of EmployeeLookup — lets a form target specific
 * users (e.g. a notification rule's "notify these people" list) in
 * addition to role-based targeting.
 */
export const EmployeeMultiLookup: React.FC<EmployeeMultiLookupProps> = ({
  value,
  onChange,
  label = 'Notify Specific Users',
  helperText,
}) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<readonly Employee[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasLoadedDefaults = useRef(false);

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
          setOptions(value || []);
          hasLoadedDefaults.current = false;
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  };

  useEffect(() => {
    if (debouncedInput.length < 2) {
      if (!open || options.length === 0) setOptions(value || []);
      return undefined;
    }
    return runSearch(debouncedInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInput]);

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
      multiple
      id="employee-multi-lookup"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      getOptionLabel={(option) => option.name}
      options={options}
      loading={loading}
      value={value}
      noOptionsText={fetchError || (inputValue.length > 0 && inputValue.length < 2 ? 'Keep typing…' : 'No employees found')}
      onChange={(event: any, newValue: Employee[]) => {
        onChange(newValue);
      }}
      onInputChange={(event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip label={option.name} size="small" {...getTagProps({ index })} key={option.id} />
        ))
      }
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
          error={!!fetchError}
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
