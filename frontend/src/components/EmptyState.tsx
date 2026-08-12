import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box
      sx={{
        py: 8, px: 3,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 64, height: 64,
            borderRadius: 3,
            bgcolor: '#EEF2FA',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9BADC5',
            mb: 2.5,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography fontWeight={700} sx={{ color: '#1A2340', mb: 0.75 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mb: action ? 3 : 0 }}>
          {description}
        </Typography>
      )}
      {action}
    </Box>
  );
}
