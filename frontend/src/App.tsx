import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Trips from './pages/Trips';
import TripForm from './pages/TripForm';
import Visits from './pages/Visits';
import Leads from './pages/Leads';
import Reservations from './pages/Reservations';
import SystemHealthPage from './pages/SystemHealth';
import Gallery from './pages/Gallery';
import Settings from './pages/Settings';
import { ApiRequestError, authApi } from './api';
import { ToastProvider } from './hooks/useToast';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clearSession = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    };
    window.addEventListener('overtrip:session-ended', clearSession);
    return () => window.removeEventListener('overtrip:session-ended', clearSession);
  }, []);

  useEffect(() => {
    let active = true;
    const storedToken = localStorage.getItem('auth_token');
    if (!storedToken) { setLoading(false); return; }
    authApi.me().then((currentUser) => {
      if (active) { setToken(storedToken); setUser(currentUser); }
    }).catch(() => {
      if (active) { setToken(null); setUser(null); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = async (email: string, password: string) => {
    const { token: newToken, user: newUser } = await authApi.login(email, password);
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  };

  const logout = async () => {
    let error: unknown;
    try {
      await authApi.logout();
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) error = err;
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="spinner w-8 h-8"></div>
  </div>
);

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/new" element={<TripForm />} />
        <Route path="/trips/:id/edit" element={<TripForm />} />
        <Route path="/visits" element={<Visits />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/system" element={<SystemHealthPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

const App = () => (
  <AuthProvider>
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  </AuthProvider>
);

export default App;
