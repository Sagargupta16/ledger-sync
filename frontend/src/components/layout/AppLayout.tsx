import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar/Sidebar'

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-background relative">
      {/* Animated background orbs */}
      <div className="fixed top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-glow" />
      <div className="fixed bottom-20 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[120px] animate-glow" style={{ animationDelay: '1.5s' }} />
      
      <Sidebar />
      <main className="flex-1 overflow-auto relative z-10">
        <Outlet />
      </main>
    </div>
  )
}
