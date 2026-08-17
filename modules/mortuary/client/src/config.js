import axios from 'axios';

// Configure axios to send cookies with all requests
axios.defaults.withCredentials = true;

// Central API config — all pages should import from here
// Falls back to '/api' if the env var is not set
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Get full URL for uploaded files (logos are served statically at
// /mortuary/uploads/logos/*, not via /api — see server.js). This used to
// hardcode `http://localhost:3001`, a leftover from when this module ran
// as its own standalone dev server; in the unified platform everything is
// same-origin under the /mortuary/ mount, so a relative path is correct
// and also survives whatever host/port the platform is actually reached on.
export const getUploadUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `/mortuary${path.startsWith('/') ? path : `/${path}`}`;
};
