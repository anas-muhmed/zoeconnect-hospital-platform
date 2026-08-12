// React 18's createRoot requires this flag under Jest/jsdom (same fix as
// canvas-engine-react — see that package's jest.setup.ts for the full note).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
