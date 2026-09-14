import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, getMe } from '../utils/api';
import { getToken, setToken, clearToken } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        try {
          const data = await getMe();
          setUser(data.user);
        } catch {
          clearToken();
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await apiLogin(credentials);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // Discord OAuth callback hands us a ready-made JWT directly (no credentials to post) —
  // just store it and fetch the profile it grants access to, same end state as login().
  const loginWithToken = useCallback(async (token) => {
    setToken(token);
    const data = await getMe();
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await getMe();
    setUser(data.user);
    return data.user;
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isGm: user?.role === 'gm',
    login,
    loginWithToken,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
