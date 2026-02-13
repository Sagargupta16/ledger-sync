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

      {/* Static gradient orbs — no blur compositing, painted once */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: [
            'radial-gradient(600px circle at -10% -20%, rgba(94,92,230,0.20), transparent 70%)',
            'radial-gradient(500px circle at 110% 60%, rgba(10,132,255,0.15), transparent 70%)',
            'radial-gradient(400px circle at 50% 30%, rgba(191,90,242,0.10), transparent 70%)',
            'radial-gradient(450px circle at 20% 110%, rgba(48,209,88,0.10), transparent 70%)',
          ].join(', '),
        }}
      />

      <Sidebar />
      <main id="main-content" className="flex-1 overflow-auto relative z-10">
        <Outlet />
      </main>
    </div>
  )
}
