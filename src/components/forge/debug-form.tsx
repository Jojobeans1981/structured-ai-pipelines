'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'

export default function DebugForm() {
  const router = useRouter()
  const [bugDescription, setBugDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branchName, setBranchName] = useState('')
  const [continuous, setContinuous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/forge/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'debug',
          repoUrl,
          bugDescription,
          branchName: branchName || undefined,
          continuous,
        }),
      })

      const data = await res.json() as { runId?: string; error?: string }
      if (!res.ok || !data.runId) throw new Error(data.error ?? 'Failed to create run')
      router.push(`/forge/runs/${data.runId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Bug Description</label>
        <p className="text-gray-500 text-xs mb-2">Describe the bug and paste any error logs or stack traces below.</p>
        <textarea
          value={bugDescription}
          onChange={e => setBugDescription(e.target.value)}
          required
          rows={12}
          placeholder={`What's broken?\n\nError logs:\n[paste error output here]`}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y font-mono text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">GitLab Repo URL</label>
        <input
          type="url"
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          required
          placeholder="https://labs.gauntletai.com/your-group/your-repo"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Branch Name <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={branchName}
          onChange={e => setBranchName(e.target.value)}
          placeholder="forge/fix-bug"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Continuous Mode Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-900/30 border border-gray-800 rounded-lg">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <RotateCcw className={`h-4 w-4 ${continuous ? 'text-orange-400' : 'text-gray-500'}`} />
            <span className="text-sm font-medium text-gray-200">Continuous Mode</span>
          </div>
          <p className="text-xs text-gray-500">
            Keep retrying the debug & fix loop until tests pass (max 10 cycles).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={continuous}
          onClick={() => setContinuous(!continuous)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
            continuous ? 'bg-orange-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              continuous ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-900 disabled:text-orange-400 text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {submitting ? 'Starting diagnostic...' : 'Debug & Fix'}
      </button>
    </form>
  )
}
