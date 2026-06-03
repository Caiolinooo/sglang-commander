import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/server', label: 'Server', icon: '🖥️' },
  { to: '/chat', label: 'Chat', icon: '💬' },
  { to: '/models', label: 'Models', icon: '🤗' },
  { to: '/profiles', label: 'Profiles', icon: '📋' },
  { to: '/benchmark', label: 'Benchmark', icon: '⏱️' },
  { to: '/deploy', label: 'Deploy', icon: '🌐' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="w-56 bg-surface border-r border-border flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-bold text-white">SGLang</h2>
        <p className="text-xs text-text-muted">Commander v0.1.0</p>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive ? 'bg-primary/20 text-primary font-medium' : 'text-text-muted hover:text-white hover:bg-surface-2'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted truncate">{user?.username}</p>
          <button
            onClick={toggleTheme}
            className="text-xs px-2 py-1 rounded bg-surface-2 text-text-muted hover:text-white transition"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 transition w-full text-left">
          Sign out
        </button>
      </div>
    </div>
  )
}
