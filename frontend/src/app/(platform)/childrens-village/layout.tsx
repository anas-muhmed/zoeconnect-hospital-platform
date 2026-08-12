import { Metadata } from 'next';
import Box from '@mui/material/Box';

export const metadata: Metadata = {
  title: "Children's Village | ZoeConnect",
};

export default function ChildrensVillageLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 
        This is a placeholder for the Children's Village module layout.
        The main platform layout already provides the sidebar.
        If we need an inner secondary sidebar or header for CV, it goes here.
      */}
      {children}
    </Box>
  );
}
