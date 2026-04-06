import { useCallback, useEffect, useState } from 'react';
import './styles.css';
import { AuthProvider, useAuth } from './AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import PublicPage from './pages/PublicPage';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const [path, setPath] = useState(window.location.pathname || '/');
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath === path) return;
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  }, [path]);

  if (path === '/login') {
    return <LoginPage onLoginSuccess={() => navigate('/admin')} onBack={() => navigate('/')} />;
  }

  if (path === '/admin') {
    return (
      <ProtectedRoute onDenied={() => navigate('/login')}>
        <AdminPage onNavigatePublic={() => navigate('/')} />
      </ProtectedRoute>
    );
  }

  return <PublicPage onNavigateAdmin={() => navigate(isAuthenticated ? '/admin' : '/login')} />;
}
