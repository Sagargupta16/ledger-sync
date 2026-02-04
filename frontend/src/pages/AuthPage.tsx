import { useState } from 'react'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { useLogin, useRegister } from '@/hooks/api/useAuth'
import { rawColors } from '@/constants/colors'
import { ROUTES } from '@/constants'
import { getApiErrorMessage } from '@/lib/errorUtils'

type AuthMode = 'login' | 'register'

export default function AuthPage() {
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
          full_name: fullName || undefined 
        })
        toast.success('Account created successfully!')
      }
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-black">
      {/* Animated background orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#5e5ce6]/20 rounded-full blur-[120px] animate-float" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#0a84ff]/15 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
      <div className="fixed top-[50%] left-[50%] w-[400px] h-[400px] bg-[#bf5af2]/10 rounded-full blur-[80px] animate-glow" style={{ animationDelay: '4s' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center mb-8"
        >
          <div 
            className="p-4 rounded-2xl shadow-2xl mb-4"
            style={{ 
              background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
              boxShadow: `0 20px 60px ${rawColors.ios.blue}40`
            }}
          >
            <PiggyBank className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Ledger Sync</h1>
          <p className="text-gray-400 mt-2">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </p>
        </motion.div>

        {/* Auth Form */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="backdrop-blur-2xl rounded-3xl p-8 border"
          style={{
            background: 'rgba(30, 30, 35, 0.8)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </motion.div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  className="w-full pl-12 pr-12 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-xs text-gray-500 mt-1">
                  Must be at least 8 characters
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{
                background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
              }}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Toggle between login/register */}
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={toggleMode}
                className="ml-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                {mode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          By continuing, you agree to our Terms of Service
        </p>
      </motion.div>
    </div>
  )
}
