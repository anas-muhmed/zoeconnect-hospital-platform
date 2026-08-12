export type EventType = 'LOGOUT' | 'TOKEN_REFRESHED' | 'LICENSE_UPDATED' | 'TENANT_CHANGED' | 'MAINTENANCE_MODE' | 'FORCE_LOGOUT';

export interface AppEvent {
  type: EventType;
  payload?: any;
}

type EventCallback = (event: AppEvent) => void;

class EventBusService {
  private listeners: Record<string, EventCallback[]> = {};

  subscribe(type: EventType, callback: EventCallback): () => void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
    };
  }

  publish(event: AppEvent): void {
    const callbacks = this.listeners[event.type];
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }
  }
}

export const EventBus = new EventBusService();
