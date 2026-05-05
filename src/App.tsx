/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { useSocket } from './hooks/useSocket';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, user, privateKey, isHydrating } = useAuthStore();

  if (isHydrating) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600 font-medium animate-pulse">Unwrapping Keys...</p>
      </div>
    );
  }

  if (!accessToken || !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function Home() {
  const { sendWsMessage } = useSocket();
  
  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <ChatWindow sendWsMessage={sendWsMessage} />
    </div>
  );
}

export default function App() {
  const hydrateKeys = useAuthStore((state) => state.hydrateKeys);

  useEffect(() => {
    hydrateKeys();
  }, [hydrateKeys]);

  return (
    <Router>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}
