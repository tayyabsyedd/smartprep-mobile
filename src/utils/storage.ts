import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Single source of truth for the auth token. Every read/write goes through
 * these helpers so a storage failure can never crash the app and the key
 * can never drift between call sites.
 */
export const TOKEN_STORAGE_KEY = 'smartprep.auth.token';

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage failure must never crash the app — the session just won't
    // survive an app restart.
  }
}

export async function removeToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Best-effort purge; nothing useful to do on failure.
  }
}
