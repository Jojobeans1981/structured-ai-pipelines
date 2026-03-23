'use client'

import { useRef, useEffect } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'
import { useForgeStream } from '@/src/hooks/use-forge-stream'

interface LogViewerProps {
  runId: string
  initialStatus: string
}

const LEVEL_STYLES: Record<string, string> = {
  info: 'text-gray-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
}

export default function LogViewer({ runId, initialStatus }: LogViewerProps) {
  const logs = useForgeStore((s) => s.logs)
  const advanceStreamUrl = useForgeStore((s) => s.advanceStreamUrl)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Stage 1 stream
  const stage1Url = (initialStatus === 'pending' || initialStatus === 'running')
    ? `/api/forge/runs/${runId}/stream`
    : null
  useForgeStream(stage1Url)

  // Stage 2 stream (triggered by plan approval)
  useForgeStream(advanceStreamUrl)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm">
      {logs.length === 0 && (
        <p className="text-gray-600 italic">Waiting for pipeline to start...</p>
      )}
      {logs.map((log, i) => (
        <div key={i} className="mb-0.5">
          <span className="text-gray-600 text-xs mr-2">[{log.step}]</span>
          <span className={LEVEL_STYLES[log.level] || 'text-gray-300'}>{log.message}</span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  )
}
