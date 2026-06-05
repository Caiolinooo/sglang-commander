import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import Sidebar from './components/layout/Sidebar'
import Login from './pages/Login'
import SetupWizard from './pages/SetupWizard'
import Dashboard from './pages/Dashboard'
import ServerPage from './pages/ServerPage'
import ChatPage from './pages/ChatPage'
import ModelsPage from './pages/ModelsPage'
import DeployPage from './pages/DeployPage'
import SettingsPage from './pages/SettingsPage'
import BenchmarkPage from './pages/BenchmarkPage'
import ServerProfilesPage from './pages/ServerProfilesPage'
import DiagnosticsPage from './pages/DiagnosticsPage'

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  const { user, loading, setupComplete } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-text-muted text-lg animate-pulse">Loading SGLang Commander...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/setup" element={setupComplete ? <Navigate to="/login" replace /> : <SetupWizard />} />

      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/server" element={<ProtectedRoute><AppLayout><ServerPage /></AppLayout></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><AppLayout><ChatPage /></AppLayout></ProtectedRoute>} />
      <Route path="/models" element={<ProtectedRoute><AppLayout><ModelsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/deploy" element={<ProtectedRoute><AppLayout><DeployPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/benchmark" element={<ProtectedRoute><AppLayout><BenchmarkPage /></AppLayout></ProtectedRoute>} />
      <Route path="/profiles" element={<ProtectedRoute><AppLayout><ServerProfilesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/diagnostics" element={<ProtectedRoute><AppLayout><DiagnosticsPage /></AppLayout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
