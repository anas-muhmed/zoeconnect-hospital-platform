import { AxiosError } from 'axios';

/**
 * Extracts a human-readable message from a NestJS/axios error response.
 * NestJS error bodies look like: { statusCode, message, error }.
 * Falls back to a generic message when the shape doesn't match.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string | string[]; error?: string }>;
  const data = axiosError?.response?.data;
  if (data?.message) {
    return Array.isArray(data.message) ? data.message.join(', ') : data.message;
  }
  if (data?.error) return data.error;
  return fallback;
}
