export const SessionLogger = {
  logTransition: (oldState: string, newState: string, reason?: string) => {
    // Abstraction layer for session observability.
    // In the future, this can be wired to Datadog, Sentry, AppInsights, etc.
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[SessionManager] Transition: ${oldState} -> ${newState}`, reason ? `| Reason: ${reason}` : '');
    }
  },
  error: (message: string, error?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[SessionManager] ${message}`, error);
    }
  }
};
