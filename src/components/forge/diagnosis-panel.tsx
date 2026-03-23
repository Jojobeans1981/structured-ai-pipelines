'use client'

import type { FixPlanStep } from '@/src/services/forge/types/fix'

interface DiagnosisPanelProps {
  rootCause: string
  affectedFiles: string[]
  fixPlan: FixPlanStep[]
}

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-green-900 text-green-300',
  modify: 'bg-yellow-900 text-yellow-300',
  delete: 'bg-red-900 text-red-300',
}

export default function DiagnosisPanel({ rootCause, affectedFiles, fixPlan }: DiagnosisPanelProps) {
  return (
    <div className="border border-orange-800 rounded-lg p-5 space-y-4">
      <h2 className="text-orange-300 font-semibold text-sm uppercase tracking-wide">Diagnosis</h2>

      <div className="bg-orange-950 border border-orange-900 rounded p-3 text-orange-100 text-sm">
        {rootCause}
      </div>

      <div>
        <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Affected Files</h3>
        <ul className="space-y-1">
          {affectedFiles.map(f => (
            <li key={f} className="text-gray-300 text-sm font-mono">{f}</li>
          ))}
        </ul>
      </div>

      {fixPlan.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Fix Plan</h3>
          <ol className="space-y-2">
            {fixPlan.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-gray-500 text-xs mt-1 w-4 flex-shrink-0">{i + 1}.</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTION_STYLES[step.action] || ''}`}>
                  {step.action}
                </span>
                <div>
                  <span className="text-gray-300 text-xs font-mono">{step.file}</span>
                  <p className="text-gray-400 text-xs mt-0.5">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
