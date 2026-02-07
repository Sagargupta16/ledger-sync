import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar/Sidebar'

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-black relative overflow-hidden">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-ios-blue focus:text-white focus:rounded-xl focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* iOS-style animated gradient orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#5e5ce6]/20 rounded-full blur-[120px] animate-float" aria-hidden="true" />
      <div className="fixed top-[60%] right-[-10%] w-[500px] h-[500px] bg-[#0a84ff]/15 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} aria-hidden="true" />
      <div className="fixed top-[30%] left-[50%] w-[400px] h-[400px] bg-[#bf5af2]/10 rounded-full blur-[80px] animate-glow" style={{ animationDelay: '4s' }} aria-hidden="true" />
      <div className="fixed bottom-[-10%] left-[20%] w-[450px] h-[450px] bg-[#30d158]/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: '3s' }} aria-hidden="true" />

      <Sidebar />
      <main id="main-content" className="flex-1 overflow-auto relative z-10">
        <Outlet />
      </main>
    </div>
  )
}
