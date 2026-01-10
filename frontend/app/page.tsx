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

        {/* Features */}
        <div className="mt-24 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon="🔄"
              title="Smart Reconciliation"
              description="Automatic insert, update, and delete operations"
            />
            <FeatureCard
              icon="🆔"
              title="Deterministic IDs"
              description="SHA-256 hashing for consistency"
            />
            <FeatureCard
              icon="⚡"
              title="Idempotent"
              description="Safe to upload multiple times"
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-24 text-center text-sm text-slate-500">
          <p>Built with Next.js & FastAPI</p>
        </footer>
      </div>
    </main>
  );
}

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  );
}
