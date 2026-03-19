import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, LoginResponse } from '../api';

export interface AuthUser {
  id?: number | string;
  name?: string;
  role?: string;
  employee_code?: string;
  position?: string;
  email?: string;
  [key: string]: unknown;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (employee_code: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  roleMode: 'DEFAULT' | 'USER';
  setRoleMode: (mode: 'DEFAULT' | 'USER') => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [baseUser, setBaseUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleMode, setRoleModeState] = useState<'DEFAULT' | 'USER'>('DEFAULT');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setBaseUser(parsed);
      const modeKey = `role_mode_${parsed?.id || parsed?.employee_code || 'default'}`;
      const storedMode = localStorage.getItem(modeKey);
      if (storedMode === 'USER') {
        setRoleModeState('USER');
        localStorage.setItem('role_mode_active', 'USER');
      }
    }
    setLoading(false);
  }, []);

  const login = async (employee_code: string, password: string) => {
    try {
      const response = await authAPI.login(employee_code, password);
      const { user, token } = response.data as LoginResponse;
      if (!token) throw new Error('No token received from server');
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setBaseUser(user as AuthUser);
      const modeKey = `role_mode_${(user as AuthUser)?.id || (user as AuthUser)?.employee_code || 'default'}`;
      localStorage.removeItem(modeKey);
  localStorage.removeItem('role_mode_active');
      setRoleModeState('DEFAULT');
      return user as AuthUser;
    } catch (error: any) {
      throw error.response?.data?.message || 'Login failed';
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role_mode_active');
    setBaseUser(null);
    setRoleModeState('DEFAULT');
  };

  const setRoleMode = (mode: 'DEFAULT' | 'USER') => {
    if (!baseUser) return;
    const modeKey = `role_mode_${baseUser?.id || baseUser?.employee_code || 'default'}`;
    if (mode === 'USER') {
      localStorage.setItem(modeKey, 'USER');
      localStorage.setItem('role_mode_active', 'USER');
    } else {
      localStorage.removeItem(modeKey);
      localStorage.removeItem('role_mode_active');
    }
    setRoleModeState(mode);
  };

  const normalizedRole = String(baseUser?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(normalizedRole);
  const effectiveRole = isDcRole && roleMode === 'USER' ? 'USER' : baseUser?.role;
  const user = baseUser
    ? ({
        ...baseUser,
        role: effectiveRole,
        actual_role: baseUser.role
      } as AuthUser)
    : null;

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, roleMode, setRoleMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
