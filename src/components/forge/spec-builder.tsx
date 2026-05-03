'use client'

import { useState } from 'react'
import { Flame, ChevronRight, ChevronLeft, Sparkles, Check, X } from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { cn } from '@/src/lib/utils'

interface SpecData {
  name: string
  type: string
  audience: string
  problem: string
  features: string
  stack: string
  extra: string
}

const PRODUCT_TYPES = [
  'Web App',
  'Mobile App',
  'API / Backend',
  'Dashboard / Admin Panel',
  'E-commerce Store',
  'Landing Page',
  'Chrome Extension',
  'CLI Tool',
  'Something else',
]

const STACK_OPTIONS = [
  { label: 'Next.js + TypeScript', sub: 'Best for most web apps' },
  { label: 'React + Node.js', sub: 'Flexible full-stack' },
  { label: 'Python + FastAPI', sub: 'Great for APIs and data' },
  { label: 'Vue + Express', sub: 'Lightweight alternative' },
  { label: 'Pick the best one for me', sub: 'Forge decides based on your needs' },
]

const STEPS = [
  {
    title: 'What are you building?',
    sub: 'Give it a name and pick what kind of thing it is.',
  },
  {
    title: 'Who is it for?',
    sub: 'Describe the people who will use this — their role, goals, and what they care about.',
  },
  {
    title: 'What problem does it solve?',
    sub: "What's broken, painful, or missing right now that this will fix?",
  },
  {
    title: 'What should it do?',
    sub: 'List the main things it needs to be able to do. One per line.',
  },
  {
    title: 'Any tech preferences?',
    sub: 'Pick a stack or let Forge choose — either works perfectly.',
  },
  {
    title: 'Anything else?',
    sub: 'Design style, examples you love, budget, deadline, or any constraints.',
  },
]

interface SpecBuilderProps {
  onComplete: (spec: string) => void
  onCancel: () => void
}

export default function SpecBuilder({ onComplete, onCancel }: SpecBuilderProps) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<SpecData>({
    name: '',
    type: '',
    audience: '',
    problem: '',
    features: '',
    stack: 'Pick the best one for me',
    extra: '',
  })

  const update = (key: keyof SpecData, val: string) =>
    setData((prev) => ({ ...prev, [key]: val }))

  const canAdvance = () => {
    switch (step) {
      case 0: return data.name.trim().length > 0 && data.type.length > 0
      case 1: return data.audience.trim().length > 8
      case 2: return data.problem.trim().length > 8
      case 3: return data.features.trim().length > 8
      case 4: return !!data.stack
      default: return true
    }
  }

  const assemble = (): string => {
    const features = data.features
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => `- ${f.trim()}`)
      .join('\n')

    return [
      `Build ${data.name}, a ${data.type}.`,
      '',
      'TARGET USERS',
      data.audience.trim(),
      '',
      'CORE PROBLEM',
      data.problem.trim(),
      '',
      'KEY FEATURES',
      features,
      '',
      'TECH STACK',
      data.stack,
      ...(data.extra.trim() ? ['', 'ADDITIONAL CONTEXT', data.extra.trim()] : []),
    ].join('\n')
  }

  const isLast = step === STEPS.length - 1

  return (
    <div className="rounded-xl border border-orange-500/25 bg-zinc-950/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Flame className="h-4 w-4 text-orange-500 flame-flicker" />
            <div className="absolute inset-0 blur-sm opacity-50 text-orange-500">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <span className="text-sm font-semibold text-zinc-100">Spec Builder</span>
          <span className="rounded-full bg-orange-500/15 border border-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-300 uppercase tracking-wider">
            Guided
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Close spec builder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-0 px-5 py-3 border-b border-zinc-900">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => i < step && setStep(i)}
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all',
                i < step
                  ? 'bg-orange-500 text-white cursor-pointer hover:bg-orange-400'
                  : i === step
                  ? 'bg-orange-500/20 border border-orange-500/60 text-orange-300'
                  : 'bg-zinc-800 text-zinc-600'
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'h-px flex-1 mx-1 transition-colors',
                i < step ? 'bg-orange-500/40' : 'bg-zinc-800'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="px-5 py-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-zinc-50">{STEPS[step].title}</h3>
          <p className="mt-0.5 text-sm text-zinc-500">{STEPS[step].sub}</p>
        </div>

        {/* Step 0 — Name + Type */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
                Product name
              </label>
              <input
                autoFocus
                type="text"
                value={data.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. TaskFlow, BudgetBuddy, ShipFast"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
                Type of product
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRODUCT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update('type', t)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs font-medium text-left transition-all',
                      data.type === t
                        ? 'border-orange-500/50 bg-orange-500/15 text-orange-300'
                        : 'border-zinc-700 bg-zinc-900/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 1 — Audience */}
        {step === 1 && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
              Who uses this?
            </label>
            <textarea
              autoFocus
              rows={4}
              value={data.audience}
              onChange={(e) => update('audience', e.target.value)}
              placeholder="e.g. Freelancers who struggle to track invoices and client payments. They're not technical and need something simple."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/30 resize-none"
            />
          </div>
        )}

        {/* Step 2 — Problem */}
        {step === 2 && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
              The problem
            </label>
            <textarea
              autoFocus
              rows={4}
              value={data.problem}
              onChange={(e) => update('problem', e.target.value)}
              placeholder="e.g. Right now they use spreadsheets and email threads to manage clients. It's messy, they lose track of unpaid invoices, and chasing payments feels awkward."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/30 resize-none"
            />
          </div>
        )}

        {/* Step 3 — Features */}
        {step === 3 && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
              Key features — one per line
            </label>
            <textarea
              autoFocus
              rows={6}
              value={data.features}
              onChange={(e) => update('features', e.target.value)}
              placeholder={`Client list with contact details\nCreate and send invoices by email\nMark invoices as paid\nDashboard showing outstanding balance\nReminder notifications for overdue invoices`}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/30 resize-none font-mono"
            />
          </div>
        )}

        {/* Step 4 — Stack */}
        {step === 4 && (
          <div className="space-y-2">
            {STACK_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => update('stack', opt.label)}
                className={cn(
                  'w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all',
                  data.stack === opt.label
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-200'
                    : 'border-zinc-700 bg-zinc-900/30 text-zinc-300 hover:border-zinc-600'
                )}
              >
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{opt.sub}</div>
                </div>
                {data.stack === opt.label && (
                  <Check className="h-4 w-4 text-orange-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Step 5 — Extra */}
        {step === 5 && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-zinc-500 mb-2">
              Extra context <span className="text-zinc-700 normal-case tracking-normal font-normal">(optional)</span>
            </label>
            <textarea
              autoFocus
              rows={5}
              value={data.extra}
              onChange={(e) => update('extra', e.target.value)}
              placeholder="e.g. Clean, minimal design — think Linear or Notion. No complex animations. Must work on mobile. I have a logo already."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/30 resize-none"
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-zinc-800/60 px-5 py-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
          className="text-zinc-500 hover:text-zinc-300"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        {isLast ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onComplete(assemble())}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white border-0 shadow-lg shadow-orange-500/20"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Build My Spec
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!canAdvance()}
            onClick={() => setStep((s) => s + 1)}
            className="bg-orange-600 hover:bg-orange-500 text-white border-0 disabled:opacity-40"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
