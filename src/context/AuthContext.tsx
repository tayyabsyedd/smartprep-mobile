import axios from 'axios';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, onUnauthenticated } from '../services/api';
import type { AuthResponse, User } from '../types';
import { getToken, removeToken, setToken } from '../utils/storage';

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
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch GET /api/auth/me (profile, quotas, entitlements). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resetSession = useCallback(() => {
    setUser(null);
    setTokenState(null);
  }, []);

  // --- Actions -------------------------------------------------------------

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
  }, []);

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
  }, []);

  const logout = useCallback(async () => {
    try {
      // Best-effort: revokes the token server-side when reachable.
      await api.post('/auth/logout');
    } catch {
      // A dead token or offline device must never trap the user
      // in a logged-in state.
    } finally {
      await removeToken();
      resetSession();
    }
  }, [resetSession]);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get<User>('/auth/me');
    setUser(data);
  }, []);

  // --- Boot lifecycle -------------------------------------------------------

  useEffect(() => {
    // Subscribe first: a 401 raised while the boot check itself runs must
    // also drop the session (the interceptor purges storage and emits).
    const unsubscribe = onUnauthenticated(() => resetSession());

    (async () => {
      try {
        const stored = await getToken();
        if (stored) {
          const { data } = await api.get<User>('/auth/me');
          setTokenState(stored);
          setUser(data);
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
    () => ({ user, token, isLoading, login, register, logout, refreshUser }),
    [user, token, isLoading, login, register, logout, refreshUser]
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
