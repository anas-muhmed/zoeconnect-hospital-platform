// React 18's createRoot requires this flag under Jest/jsdom so `act()` from
// react-dom/test-utils recognizes the test environment (Milestone 2 test infra).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
