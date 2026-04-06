import React from 'react';
import { useAuth } from '../AuthContext';

export default function ProtectedRoute({ children, onDenied }: { children: React.ReactNode; onDenied: () => void }) {
  const { isAuthenticated } = useAuth();

  React.useEffect(() => {
    if (!isAuthenticated) onDenied();
  }, [isAuthenticated, onDenied]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
