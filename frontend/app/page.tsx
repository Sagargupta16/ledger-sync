import FileUpload from "@/components/FileUpload";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 relative">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/30 via-slate-950 to-purple-950/30"></div>
      
      <div className="container mx-auto px-4 py-16 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-3 text-white">
            Ledger Sync
          </h1>
          <p className="text-lg text-slate-400">
            Excel Ingestion & Database Reconciliation
          </p>
          
          {/* Navigation to Insights */}
          <div className="mt-6">
            <Link
              href="/insights"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white transition-all duration-200"
            >
              <BarChart3 className="w-5 h-5" />
              <span>View Financial Insights</span>
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          <FileUpload />
        </div>
      </div>
    </main>
  );
}
