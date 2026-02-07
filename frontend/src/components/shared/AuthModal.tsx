import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  PiggyBank,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  X,
  LogIn,
} from 'lucide-react'
import { toast } from 'sonner'
import { useLogin, useRegister } from '@/hooks/api/useAuth'
import { rawColors } from '@/constants/colors'
import { ROUTES } from '@/constants'
import { getApiErrorMessage } from '@/lib/errorUtils'

type AuthMode = 'login' | 'register'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: Readonly<AuthModalProps>) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const loginMutation = useLogin()
  const registerMutation = useRegister()
  const isLoading = loginMutation.isPending || registerMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      toast.error('Please fill in all required fields')
      return
    }

    if (mode === 'register' && password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    try {
      if (mode === 'login') {
        await loginMutation.mutateAsync({ email, password })
        toast.success('Welcome back!')
      } else {
        await registerMutation.mutateAsync({
          email,
          password,
          full_name: fullName || undefined,
        })
        toast.success('Account created successfully!')
      }
      onClose()
      navigate(ROUTES.DASHBOARD)
    } catch (error) {
      const message = getApiErrorMessage(error)
      toast.error(message)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setPassword('')
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setFullName('')
    setMode('login')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 p-4"
          >
            <div
              className="relative backdrop-blur-2xl rounded-3xl p-8 border shadow-2xl"
              style={{
                background: 'rgba(30, 30, 35, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}
            >
              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center mb-6">
                <div
                  className="p-3 rounded-2xl shadow-xl mb-3"
                  style={{
                    background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                  }}
                >
                  <PiggyBank className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {mode === 'login'
                    ? 'Sign in to continue to Ledger Sync'
                    : 'Get started with your financial journey'}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <label htmlFor="auth-fullname" className="block text-sm font-medium text-gray-300 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                      <input
                        id="auth-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-input border border-white/10 text-white placeholder-text-quaternary focus:outline-none focus:border-ios-blue focus:ring-1 focus:ring-ios-blue transition-colors text-sm"
                      />
                    </div>
                  </motion.div>
                )}

                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-input border border-white/10 text-white placeholder-text-quaternary focus:outline-none focus:border-ios-blue focus:ring-1 focus:ring-ios-blue transition-colors text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-password" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={mode === 'register' ? 8 : undefined}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-input border border-white/10 text-white placeholder-text-quaternary focus:outline-none focus:border-ios-blue focus:ring-1 focus:ring-ios-blue transition-colors text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-muted-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {mode === 'register' && (
                    <p className="text-xs text-text-tertiary mt-1">
                      Must be at least 8 characters
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 mt-2"
                  style={{
                    background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {mode === 'login' ? 'Sign In' : 'Create Account'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Toggle */}
              <div className="mt-5 text-center">
                <p className="text-muted-foreground text-sm">
                  {mode === 'login'
                    ? "Don't have an account?"
                    : 'Already have an account?'}
                  <button
                    onClick={toggleMode}
                    className="ml-2 text-ios-blue hover:text-ios-blue-vibrant font-medium transition-colors"
                  >
                    {mode === 'login' ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Export the LoginButton component for use in HomePage
export function LoginButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-all hover:scale-105 border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10"
    >
      <LogIn className="w-4 h-4" />
      Login / Sign Up
    </button>
  )
}
