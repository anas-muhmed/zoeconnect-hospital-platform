import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Skip internal CardContent padding (useful for tables) */
  noPadding?: boolean;
}

export default function SectionCard({
  title, subtitle, icon, action, children, noPadding,
}: SectionCardProps) {
  return (
    <Card>
      <Box sx={{ px: 2.5, py: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {icon && (
          <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
            {icon}
          </Box>
        )}
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action && <Box>{action}</Box>}
      </Box>
      <Divider />
      {noPadding ? children : <CardContent>{children}</CardContent>}
    </Card>
  );
}
