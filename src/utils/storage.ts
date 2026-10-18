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

/**
 * Guest-mode flag. Separate from the token: a guest has *no* token and no
 * server session, but chose "Continue as Guest" and should land straight
 * back in the app on restart.
 */
export const GUEST_MODE_STORAGE_KEY = 'smartprep.auth.guest';

export async function getIsGuestMode(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUEST_MODE_STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setIsGuestMode(value: boolean): Promise<void> {
  try {
    if (value) {
      await AsyncStorage.setItem(GUEST_MODE_STORAGE_KEY, '1');
    } else {
      await AsyncStorage.removeItem(GUEST_MODE_STORAGE_KEY);
    }
  } catch {
    // Best-effort; the in-memory guest state still works for this session.
  }
}
