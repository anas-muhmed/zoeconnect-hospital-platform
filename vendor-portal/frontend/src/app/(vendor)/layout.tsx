'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

import InboxIcon from '@mui/icons-material/Inbox';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import VerifiedIcon from '@mui/icons-material/Verified';
import LogoutIcon from '@mui/icons-material/Logout';
import HistoryIcon from '@mui/icons-material/History';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import MenuIcon from '@mui/icons-material/Menu';

const DRAWER_WIDTH = 240;

const NAV = [
  { label: 'Requests',    icon: <InboxIcon />,          href: '/requests'  },
  { label: 'Hospitals',   icon: <LocalHospitalIcon />,   href: '/hospitals' },
  { label: 'Cloud Tenants', icon: <CloudQueueIcon />,    href: '/cloud-tenants' },
  { label: 'Licenses',    icon: <VerifiedIcon />,        href: '/licenses'  },
  { label: 'Lic. History', icon: <HistoryIcon />,        href: '/history'   },
  { label: 'Txn Log',    icon: <ReceiptLongIcon />,      href: '/logs'      },
];

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Responsive AppShell (2026-08 fix): the drawer used to be `variant="permanent"`
  // unconditionally -- a fixed 240px sidebar with no mobile alternative at all,
  // making every route under this layout unusable on a phone (see the
  // responsiveness audit). Below `md`, the drawer becomes a `temporary`
  // (overlay) drawer toggled by a hamburger button in the AppBar, closed by
  // default, and dismissed automatically on navigation -- MUI's Modal
  // handles Escape/backdrop-click dismissal for free.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = sessionStorage.getItem('vendor_token');
    if (!token) router.replace('/login');
  }, [router]);

  // Close the mobile drawer on route change, same reasoning as the desktop
  // app's sidebar: a stale open drawer left over from the previous page
  // would otherwise sit on top of the newly-navigated content.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem('vendor_token');
    router.replace('/login');
  };

  const navigate = (href: string) => {
    router.push(href);
    if (isMobile) setMobileOpen(false);
  };

  if (!mounted) return null;

  const drawerContent = (
    <>
      <Box sx={{ px: 2, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 36, height: 36, bgcolor: 'secondary.main', borderRadius: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14, color: 'white' }}>V</Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} color="white">Vendor Portal</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>ZoeConnect License Mgmt</Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      <List sx={{ pt: 1 }}>
        {NAV.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                selected={active}
                onClick={() => navigate(item.href)}
                sx={{
                  mx: 1, mb: 0.5, borderRadius: 1,
                  // Touch target: MUI's default ListItemButton padding
                  // already clears ~44px tall with this py, kept explicit
                  // here since the mobile drawer is now the primary way
                  // touch users navigate this app.
                  py: 1.1,
                  '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.15)' },
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: active ? 'white' : 'rgba(255,255,255,0.65)' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    color: active ? 'white' : 'rgba(255,255,255,0.8)',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ mt: 'auto', p: 2 }}>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1 }} />
        <ListItemButton onClick={handleLogout} sx={{ borderRadius: 1, color: 'rgba(255,255,255,0.7)', py: 1.1 }}>
          <ListItemIcon sx={{ minWidth: 40, color: 'rgba(255,255,255,0.7)' }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Sign Out" primaryTypographyProps={{ fontSize: 14 }} />
        </ListItemButton>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {/* Sidebar: temporary (overlay, closed by default) below `md`, permanent above it. */}
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }} // better open perf on mobile, per MUI's own guidance
        sx={{
          width: isMobile ? 0 : DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH, boxSizing: 'border-box',
            bgcolor: 'primary.dark', color: 'white',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Main */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <AppBar position="static" elevation={0}
          sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ minHeight: '56px !important' }}>
            {isMobile && (
              <IconButton
                edge="start"
                aria-label="Open navigation menu"
                onClick={() => setMobileOpen(true)}
                sx={{ mr: 1.5, color: 'text.primary' }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="subtitle1" fontWeight={600} color="text.primary" sx={{ flex: 1 }} noWrap>
              {NAV.find(n => pathname.startsWith(n.href))?.label.replace('Lic. ', 'License ').replace('Txn ', 'Transaction ') ?? 'Vendor Portal'}
            </Typography>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, overflow: 'auto', bgcolor: 'grey.50' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
