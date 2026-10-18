import axios from 'axios';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, onUnauthenticated } from '../services/api';
import type { AuthResponse, User } from '../types';
import {
  getIsGuestMode,
  getToken,
  removeToken,
  setIsGuestMode,
  setToken,
} from '../utils/storage';

export interface LoginCredentials {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  /** True while browsing via "Continue as Guest" (no token, no account). */
  isGuest: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  /** Enter guest mode: placeholder user, no token, persisted across restarts. */
  continueAsGuest: () => Promise<void>;
  /** Re-fetch GET /api/auth/me (profile, quotas, entitlements). */
  refreshUser: () => Promise<void>;
}

/** Placeholder identity for guest mode: no token, no server state. */
const GUEST_USER: User = {
  id: 0,
  name: 'Guest Student',
  email: '',
  phone: null,
  role: 'student',
  is_enrolled: false,
  enrollment_id: null,
  modules: [],
  entitlements: [],
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Ref mirror of isGuest for the 401 subscription below, which is
  // registered once and must see the latest value.
  const isGuestRef = useRef(false);

  const resetSession = useCallback(() => {
    setUser(null);
    setTokenState(null);
  }, []);

  // --- Actions -------------------------------------------------------------

  const clearGuestMode = useCallback(async () => {
    await setIsGuestMode(false);
    isGuestRef.current = false;
    setIsGuest(false);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    // The API takes a single `login` field (email or phone); accept either.
    const loginId = credentials.email ?? credentials.phone;
    if (!loginId) {
      throw new Error('Email or phone number is required.');
    }

    const { data } = await api.post<AuthResponse>('/auth/login', {
      login: loginId,
      password: credentials.password,
    });

    await setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
    // A guest who logs in leaves guest mode behind.
    await clearGuestMode();
  }, [clearGuestMode]);

  const register = useCallback(async (data: RegisterData) => {
    // Email is required by the API; if the caller omits it the server
    // answers 422 and extractErrorMessage() surfaces the message.
    const payload = {
      name: data.name,
      password: data.password,
      ...(data.email ? { email: data.email } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
    };

    const { data: res } = await api.post<AuthResponse>('/auth/register', payload);

    await setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    // A guest who registers leaves guest mode behind.
    await clearGuestMode();
  }, [clearGuestMode]);

  const continueAsGuest = useCallback(async () => {
    await setIsGuestMode(true);
    isGuestRef.current = true;
    setIsGuest(true);
    setTokenState(null);
    setUser(GUEST_USER);
    // RootNavigator flips to the app tabs on isGuest.
  }, []);

  const logout = useCallback(async () => {
    if (!isGuestRef.current) {
      try {
        // Best-effort: revokes the token server-side when reachable.
        // Guests have no token, so there is nothing to revoke.
        await api.post('/auth/logout');
      } catch {
        // A dead token or offline device must never trap the user
        // in a logged-in state.
      }
    }
    await removeToken();
    await clearGuestMode();
    resetSession();
  }, [resetSession, clearGuestMode]);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get<User>('/auth/me');
    setUser(data);
  }, []);

  // --- Boot lifecycle -------------------------------------------------------

  useEffect(() => {
    // Subscribe first: a 401 raised while the boot check itself runs must
    // also drop the session (the interceptor purges storage and emits).
    // Guest mode has no token, so a 401 there is a per-screen error, not
    // a logout — only real token sessions get torn down.
    const unsubscribe = onUnauthenticated(() => {
      if (!isGuestRef.current) {
        resetSession();
      }
    });

    (async () => {
      try {
        const stored = await getToken();
        if (stored) {
          const { data } = await api.get<User>('/auth/me');
          setTokenState(stored);
          setUser(data);
        } else if (await getIsGuestMode()) {
          // Returning guest: straight back into guest mode, no network needed.
          isGuestRef.current = true;
          setIsGuest(true);
          setUser(GUEST_USER);
        }
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;

        if (status === 401) {
          // Token rejected. Storage is already purged by the interceptor;
          // just align the in-memory state.
          resetSession();
        } else if (!axios.isAxiosError(error) || error.response) {
          // Any other API-side failure: the token is unusable, drop it.
          await removeToken();
          resetSession();
        } else {
          // No response at all (offline cold start): keep the stored token
          // so a flaky connection doesn't log the user out. `user` stays
          // null until a refresh succeeds; screens must tolerate that.
          const stored = await getToken();
          setTokenState(stored);
        }
      } finally {
        // Only after the check settles does the navigator decide.
        setIsLoading(false);
      }
    })();

    return unsubscribe;
  }, [resetSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isGuest,
      isLoading,
      login,
      register,
      logout,
      continueAsGuest,
      refreshUser,
    }),
    [
      user,
      token,
      isGuest,
      isLoading,
      login,
      register,
      logout,
      continueAsGuest,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}
