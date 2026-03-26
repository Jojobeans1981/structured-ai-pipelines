'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Upload, FileText, Loader2, GitBranch, Link } from 'lucide-react'

type InputMode = 'paste' | 'upload'

export default function BuildForm() {
  const router = useRouter()
  const [inputMode, setInputMode] = useState<InputMode>('paste')
  const [specText, setSpecText] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branchName, setBranchName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = () => {
    const file = fileRef.current?.files?.[0]
    setSelectedFileName(file?.name || null)
  }

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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Spec input mode toggle */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Feature Spec</label>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setInputMode('paste')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              inputMode === 'paste'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-300'
            }`}>
            <FileText className="h-3.5 w-3.5" />
            Paste Text
          </button>
          <button type="button" onClick={() => setInputMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              inputMode === 'upload'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-300'
            }`}>
            <Upload className="h-3.5 w-3.5" />
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
            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/30 resize-y font-mono text-sm"
          />
        ) : (
          <div className="space-y-2">
            <label
              className="flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-zinc-700 hover:border-orange-500/30 bg-zinc-900/30 hover:bg-orange-500/5 cursor-pointer transition-colors"
              htmlFor="forge-spec-file"
            >
              <Upload className="h-8 w-8 text-zinc-500" />
              <span className="text-sm text-zinc-400">
                {selectedFileName || 'Click to select a spec file'}
              </span>
              <span className="text-xs text-zinc-600">
                Supports .md, .txt, .pdf
              </span>
            </label>
            <input
              id="forge-spec-file"
              ref={fileRef}
              type="file"
              accept=".md,.txt,.pdf"
              required
              onChange={handleFileChange}
              className="hidden"
            />
            {selectedFileName && (
              <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                <FileText className="h-4 w-4" />
                {selectedFileName}
              </div>
            )}
          </div>
        )}
      </div>

      {/* GitLab Repo URL */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-2">
          <Link className="h-3.5 w-3.5" />
          GitLab Repo URL
        </label>
        <input
          type="url"
          value={repoUrl}
          onChange={e => setRepoUrl(e.target.value)}
          required
          placeholder="https://labs.gauntletai.com/your-group/your-repo"
          className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/30 text-sm"
        />
      </div>

      {/* Branch name */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-2">
          <GitBranch className="h-3.5 w-3.5" />
          Branch Name <span className="text-zinc-500 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={branchName}
          onChange={e => setBranchName(e.target.value)}
          placeholder="forge/my-feature"
          className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/30 text-sm"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg p-3">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-orange-500/10 hover:shadow-orange-500/20"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Flame className="h-5 w-5" />
        )}
        {submitting ? 'Starting pipeline...' : 'Build Feature'}
      </button>
    </form>
  )
}
