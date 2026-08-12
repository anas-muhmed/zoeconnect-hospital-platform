module.exports = new Proxy({}, {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'then') return undefined; // Prevent Promise-like behavior issues
    
    // Return a dummy React component (or a function/class that doesn't crash if called)
    return function DummyComponent() {
      return null;
    };
  }
});
