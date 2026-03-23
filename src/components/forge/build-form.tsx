'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type InputMode = 'paste' | 'upload'

export default function BuildForm() {
  const router = useRouter()
  const [inputMode, setInputMode] = useState<InputMode>('paste')
  const [specText, setSpecText] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branchName, setBranchName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      let res: Response

      if (inputMode === 'upload') {
        const file = fileRef.current?.files?.[0]
        if (!file) throw new Error('Please select a file')
        const fd = new FormData()
        fd.append('repoUrl', repoUrl)
        fd.append('specFile', file)
        if (branchName) fd.append('branchName', branchName)
        res = await fetch('/api/forge/runs', { method: 'POST', body: fd })
      } else {
        if (!specText.trim()) throw new Error('Spec text cannot be empty')
        res = await fetch('/api/forge/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'build',
            repoUrl,
            specContent: specText,
            branchName: branchName || undefined,
          }),
        })
      }

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
        <label className="block text-sm font-medium text-gray-300 mb-2">Feature Spec</label>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setInputMode('paste')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${inputMode === 'paste' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            Paste Text
          </button>
          <button type="button" onClick={() => setInputMode('upload')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${inputMode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            Upload File
          </button>
        </div>
        {inputMode === 'paste' ? (
          <textarea
            value={specText}
            onChange={e => setSpecText(e.target.value)}
            required
            rows={10}
            placeholder="Describe the feature you want to build..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono text-sm"
          />
        ) : (
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt"
            required
            className="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">GitLab Repo URL</label>
        <input
          type="url"
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          required
          placeholder="https://labs.gauntletai.com/your-group/your-repo"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          placeholder="forge/my-feature"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {submitting ? 'Starting pipeline...' : 'Build Feature'}
      </button>
    </form>
  )
}
