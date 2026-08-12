import { LogoutReason } from './SessionManager';

export interface SessionMetric {
  event: 'logout' | 'login' | 'refresh';
  reason?: LogoutReason | string;
  duration?: number;
  tenantId?: string;
  authenticationProvider?: string;
}

export interface SessionMetricsProvider {
  record(event: SessionMetric): void;
}

export class NoOpSessionMetricsProvider implements SessionMetricsProvider {
  record(event: SessionMetric): void {
    // No-op by default. 
    // Extend this class to pipe metrics to Datadog, Grafana, OpenTelemetry, etc.
  }
}

export const SessionMetrics: SessionMetricsProvider = new NoOpSessionMetricsProvider();
