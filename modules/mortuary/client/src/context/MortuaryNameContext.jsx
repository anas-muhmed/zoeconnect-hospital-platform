import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config.js';

const MortuaryNameContext = createContext();

export const useMortuaryName = () => {
  const context = useContext(MortuaryNameContext);
  if (!context) {
    throw new Error('useMortuaryName must be used within a MortuaryNameProvider');
  }
  return context;
};

export const MortuaryNameProvider = ({ children }) => {
  const [mortuaryName, setMortuaryName] = useState(null);
  const [mortuaryLogo, setMortuaryLogo] = useState(null);
  const [mortuaryAddress, setMortuaryAddress] = useState(null);
  const [loading, setLoading] = useState(false);

  // This endpoint is authenticated and scoped to the caller's own hospital,
  // so fetching it unconditionally here (e.g. before anyone has logged in)
  // always 401s - worse, if that doomed request resolves AFTER a later,
  // successful post-login fetch, it would overwrite the correct hospital's
  // name/logo with the fallback default. Each login page calls
  // fetchMortuarySettings() itself right after a successful login, so this
  // only needs to cover one case on its own: the user reloading the page
  // while already logged in (the login cookie is still valid, but no login
  // page runs to trigger the fetch). localStorage's role flag is a cheap,
  // synchronous signal for "was logged in" without needing to guess from
  // the (httpOnly, unreadable) cookie itself.
  useEffect(() => {
    if (localStorage.getItem('role')) {
      fetchMortuarySettings();
    }
  }, []);

  const fetchMortuarySettings = async () => {
    try {
      const [nameRes, logoRes] = await Promise.all([
        axios.get(`${API_BASE}/billing-settings/mortuary-name`),
        axios.get(`${API_BASE}/billing-settings/mortuary-logo`)
      ]);
      setMortuaryName(nameRes.data.mortuary_name || null);
      setMortuaryLogo(logoRes.data.mortuary_logo);
      setMortuaryAddress(nameRes.data.address || null);
    } catch (error) {
      console.error('Error fetching mortuary settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateMortuaryName = (newName) => {
    setMortuaryName(newName);
  };

  const updateMortuaryLogo = (newLogo) => {
    setMortuaryLogo(newLogo);
  };

  return (
    <MortuaryNameContext.Provider value={{ mortuaryName, mortuaryLogo, mortuaryAddress, loading, updateMortuaryName, updateMortuaryLogo, fetchMortuarySettings }}>
      {children}
    </MortuaryNameContext.Provider>
  );
};