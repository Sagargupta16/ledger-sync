import FileUpload from "@/components/FileUpload";

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
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          <FileUpload />
        </div>
      </div>
    </main>
  );
}
