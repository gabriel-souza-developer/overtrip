import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import FirstPassword from './pages/FirstPassword';
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
import { ApiRequestError, authApi } from './api';
import { ToastProvider } from './hooks/useToast';

// Cada página vira um arquivo separado: o painel só baixa o código da tela aberta.
const platformMode = import.meta.env.VITE_PLATFORM_MODE === 'true';
const Prototype = import.meta.env.DEV && !platformMode ? React.lazy(() => import('./prototype/Prototype')) : null;
const Workspace = import.meta.env.DEV || platformMode ? React.lazy(() => import('./pages/Workspace')) : null;

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Trips = React.lazy(() => import('./pages/Trips'));
const TripForm = React.lazy(() => import('./pages/TripForm'));
const Visits = React.lazy(() => import('./pages/Visits'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Reservations = React.lazy(() => import('./pages/Reservations'));
const SystemHealthPage = React.lazy(() => import('./pages/SystemHealth'));
const Gallery = React.lazy(() => import('./pages/Gallery'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Users = React.lazy(() => import('./pages/Users'));
const SocialPosts = React.lazy(() => import('./pages/SocialPosts'));
const OrganizationSelect = React.lazy(() => import('./pages/OrganizationSelect'));
const OrganizationLayout = React.lazy(() => import('./pages/OrganizationLayout'));
const OrganizationTrips = React.lazy(() => import('./pages/OrganizationTrips'));
const OrganizationVisits = React.lazy(() => import('./pages/OrganizationVisits'));
const OrganizationGallery = React.lazy(() => import('./pages/OrganizationGallery'));
const OrganizationDashboard = React.lazy(() => import('./pages/OrganizationDashboard'));
const OrganizationLeads = React.lazy(() => import('./pages/OrganizationLeads'));
const OrganizationReservations = React.lazy(() => import('./pages/OrganizationReservations'));
const OrganizationSettings = React.lazy(() => import('./pages/OrganizationSettings'));

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  legacyAccess: boolean;
  mustChangePassword: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clearSession = () => {
      setUser(null);
      // Remove tokens saved by older panel versions.
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    };
    window.addEventListener('overtrip:session-ended', clearSession);
    return () => window.removeEventListener('overtrip:session-ended', clearSession);
  }, []);

  useEffect(() => {
    let active = true;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    authApi.me().then((currentUser) => {
      if (active) setUser(currentUser);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = async (email: string, password: string) => {
    const newUser = await authApi.login(email, password);
    setUser(newUser);
    return newUser;
  };

  const logout = async () => {
    let error: unknown;
    try {
      await authApi.logout();
    } catch (err) {
      if (!(err instanceof ApiRequestError && err.status === 401)) error = err;
    } finally {
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? (user.mustChangePassword ? <Navigate to="/primeiro-acesso" replace /> : <Outlet />) : <Navigate to="/login" replace />;
};

// O backend já recusa (403); aqui evitamos mostrar telas que só dariam erro.
const AdminRoute = () => {
  const { user } = useAuth();
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

// legacyAccess vem só de /auth/login e /auth/me, autenticados; o servidor
// revalida de novo em cada rota legada, então isto é apenas conveniência de navegação.
const LegacyRoute: React.FC = () => {
  const { user } = useAuth();
  return user?.legacyAccess ? <Outlet /> : <Navigate to="/empresa" replace />;
};

const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/primeiro-acesso" replace />;
  return <Navigate to={user.legacyAccess ? '/dashboard' : '/empresa'} replace />;
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="spinner w-8 h-8"></div>
  </div>
);

const PlatformWorkspace = () => <React.Suspense fallback={<LoadingScreen />}>{Workspace && <Workspace />}</React.Suspense>;

const AppRoutes = () => platformMode ? (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/primeiro-acesso" element={<FirstPassword />} />
    <Route path="/esqueci-senha" element={<React.Suspense fallback={<LoadingScreen />}><ForgotPassword /></React.Suspense>} />
    <Route path="/redefinir-senha" element={<React.Suspense fallback={<LoadingScreen />}><ResetPassword /></React.Suspense>} />
    <Route element={<ProtectedRoute />}>
      <Route path="/espaco" element={<PlatformWorkspace />} />
      <Route path="*" element={<Navigate to="/espaco" replace />} />
    </Route>
  </Routes>
) : (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/primeiro-acesso" element={<FirstPassword />} />
    {/* Públicas no painel padrão também: o link do login e o do e-mail levam para cá. */}
    <Route path="/esqueci-senha" element={<React.Suspense fallback={<LoadingScreen />}><ForgotPassword /></React.Suspense>} />
    <Route path="/redefinir-senha" element={<React.Suspense fallback={<LoadingScreen />}><ResetPassword /></React.Suspense>} />
    <Route element={<ProtectedRoute />}>
      {Workspace && <Route path="/espaco" element={<React.Suspense fallback={<LoadingScreen />}><Workspace /></React.Suspense>} />}
      <Route path="/empresa" element={<React.Suspense fallback={<LoadingScreen />}><OrganizationSelect /></React.Suspense>} />
      <Route path="/empresa/:organizationId" element={<React.Suspense fallback={<LoadingScreen />}><OrganizationLayout /></React.Suspense>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<OrganizationDashboard />} />
        <Route path="trips" element={<OrganizationTrips />} />
        <Route path="visits" element={<OrganizationVisits />} />
        <Route path="gallery" element={<OrganizationGallery />} />
        <Route path="social-posts" element={<SocialPosts />} />
        <Route path="leads" element={<OrganizationLeads />} />
        <Route path="reservations" element={<OrganizationReservations />} />
        <Route path="settings" element={<OrganizationSettings />} />
      </Route>
      <Route element={<LegacyRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/trips/new" element={<TripForm />} />
          <Route path="/trips/:id/edit" element={<TripForm />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route element={<AdminRoute />}>
            <Route path="/leads" element={<Leads />} />
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/social-posts" element={<SocialPosts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/system" element={<SystemHealthPage />} />
          </Route>
        </Route>
      </Route>
    </Route>
    <Route path="/" element={<RootRedirect />} />
    <Route path="*" element={<RootRedirect />} />
  </Routes>
);

const App = () => (
  import.meta.env.DEV && !platformMode && window.location.pathname === '/prototipo' && Prototype ? (
    <React.Suspense fallback={<LoadingScreen />}><Prototype /></React.Suspense>
  ) : <AuthProvider>
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  </AuthProvider>
);

export default App;
