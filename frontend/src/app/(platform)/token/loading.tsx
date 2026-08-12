import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

// Next.js route-segment loading fallback for /token. Paints instantly (as
// part of the initial streamed shell) instead of leaving the iframe/page
// blank white while the client bundle for this route downloads and
// hydrates -- this was previously the single biggest chunk of the HIS
// auto-login "click Token Queue -> screen looks frozen" delay (~5s of pure
// blank white with zero feedback, confirmed via frame-by-frame video review).
export default function TokenLoading() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <CircularProgress size={32} />
    </Box>
  );
}
