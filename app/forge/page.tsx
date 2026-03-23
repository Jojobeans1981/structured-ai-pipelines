import Link from 'next/link'
import ModeSelector from '@/src/components/forge/mode-selector'

export default function ForgePage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Forge</h1>
        <p className="text-gray-400 text-sm">
          Build features or fix bugs — Forge clones your repo, generates code, and opens a merge request.
        </p>
        <Link href="/forge/runs" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
          View run history →
        </Link>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <ModeSelector />
      </div>
    </div>
  )
}
