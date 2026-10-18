import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { DeviceEventEmitter } from 'react-native';

export const TOKEN_STORAGE_KEY = 'smartprep.auth.token';

/**
 * Emitted (via DeviceEventEmitter) when the API answers 401. The root
 * navigator subscribes with `onUnauthenticated()` and redirects to Auth.
 */
export const UNAUTHENTICATED_EVENT = 'smartprep.unauthenticated';

const baseURL = process.env.EXPO_PUBLIC_API_URL;

if (!baseURL && __DEV__) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and point it at the Laravel API.'
  );
}

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

// ---------------------------------------------------------------------------
// Request interceptor — attach the Sanctum bearer token
// ---------------------------------------------------------------------------

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    config.headers.set('Accept', 'application/json');
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — normalize errors, handle 401
// ---------------------------------------------------------------------------

/**
 * Turns a Laravel/Axios failure into one human-readable message.
 * - 422 validation: first field's first message ("The email field is required.")
 * - Other API errors: the `message` field ("Purchase required to attempt this test.")
 * - Network failures: a connectivity hint instead of a blank crash.
 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: unknown; errors?: unknown }
      | undefined;

    if (data?.errors && typeof data.errors === 'object') {
      const fields = data.errors as Record<string, unknown>;
      const firstField = Object.keys(fields)[0];
      const firstMessage =
        firstField && Array.isArray(fields[firstField])
          ? (fields[firstField] as unknown[])[0]
          : undefined;
      if (typeof firstMessage === 'string' && firstMessage.length > 0) {
        return firstMessage;
      }
    }

    if (typeof data?.message === 'string' && data.message.length > 0) {
      return data.message;
    }

    if (error.response) {
      return `Request failed with status ${error.response.status}.`;
    }

    if (error.request) {
      return 'No response from the server. Check your connection and API URL.';
    }
  }

  return 'Something went wrong. Please try again.';
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token invalid or expired: purge it so a stale token can never be
      // reused, then broadcast — the navigator decides what "logged out" means.
      await AsyncStorage.removeItem(TOKEN_STORAGE_KEY).catch(() => undefined);
      DeviceEventEmitter.emit(UNAUTHENTICATED_EVENT);
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Token helpers + unauthenticated subscription
// ---------------------------------------------------------------------------

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Subscribe to the 401 broadcast. Returns an unsubscribe function —
 * call it in the effect cleanup of the root navigator.
 */
export function onUnauthenticated(listener: () => void): () => void {
  const subscription = DeviceEventEmitter.addListener(
    UNAUTHENTICATED_EVENT,
    listener
  );
  return () => subscription.remove();
}

export default api;
