import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface ProviderCircuit {
  state: CircuitState;
  failures: number;
  lastFailureTime?: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  
  private circuits = new Map<string, ProviderCircuit>();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RESET_TIMEOUT_MS = 60000; // 1 minute

  canExecute(providerId: string): boolean {
    const circuit = this.getOrCreateCircuit(providerId);
    
    if (circuit.state === CircuitState.CLOSED) return true;

    if (circuit.state === CircuitState.OPEN) {
      if (Date.now() - (circuit.lastFailureTime || 0) > this.RESET_TIMEOUT_MS) {
        // Transition to half-open to test health
        circuit.state = CircuitState.HALF_OPEN;
        this.logger.log(`Circuit for ${providerId} transitioned to HALF_OPEN`);
        return true;
      }
      return false; // Still open, fast fail
    }

    // HALF_OPEN allows one trial execution
    return true; 
  }

  recordSuccess(providerId: string) {
    const circuit = this.getOrCreateCircuit(providerId);
    if (circuit.state === CircuitState.HALF_OPEN || circuit.failures > 0) {
      circuit.state = CircuitState.CLOSED;
      circuit.failures = 0;
      this.logger.log(`Circuit for ${providerId} reset to CLOSED`);
    }
  }

  recordFailure(providerId: string) {
    const circuit = this.getOrCreateCircuit(providerId);
    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CircuitState.HALF_OPEN || circuit.failures >= this.FAILURE_THRESHOLD) {
      circuit.state = CircuitState.OPEN;
      this.logger.warn(`Circuit for ${providerId} tripped to OPEN`);
    }
  }

  private getOrCreateCircuit(providerId: string): ProviderCircuit {
    if (!this.circuits.has(providerId)) {
      this.circuits.set(providerId, { state: CircuitState.CLOSED, failures: 0 });
    }
    return this.circuits.get(providerId)!;
  }
}
