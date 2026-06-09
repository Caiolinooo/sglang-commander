import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'
import { getMe, checkSetupStatus, logout as apiLogout } from '../api/endpoints'

interface AuthContextType {
  user: User | null
  loading: boolean
  setupComplete: boolean
  login: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setupComplete: false,
  login: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const setupResp = await checkSetupStatus()
        const complete = setupResp.data.setup_complete
        setSetupComplete(complete)

        if (complete) {
          const token = localStorage.getItem('access_token')
          if (token) {
            const userResp = await getMe()
            setUser(userResp.data)
          }
        }
      } catch {
        localStorage.clear()
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const loginFn = (user: User, accessToken: string, refreshToken: string) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    setUser(user)
    setSetupComplete(true)
  }

  const logout = async () => {
    try { await apiLogout() } catch {}
    localStorage.clear()
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, login: loginFn, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
