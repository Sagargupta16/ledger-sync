import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar/Sidebar'

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-black relative overflow-hidden">
      {/* iOS-style animated gradient orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#5e5ce6]/20 rounded-full blur-[120px] animate-float" />
      <div className="fixed top-[60%] right-[-10%] w-[500px] h-[500px] bg-[#0a84ff]/15 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
      <div className="fixed top-[30%] left-[50%] w-[400px] h-[400px] bg-[#bf5af2]/10 rounded-full blur-[80px] animate-glow" style={{ animationDelay: '4s' }} />
      <div className="fixed bottom-[-10%] left-[20%] w-[450px] h-[450px] bg-[#30d158]/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: '3s' }} />
      
      <Sidebar />
      <main className="flex-1 overflow-auto relative z-10">
        <Outlet />
      </main>
    </div>
  )
}
