export interface ForgeTemplate {
  id: string
  title: string
  badge: string
  pipelineType: 'build' | 'diagnostic' | 'refactor' | 'enhance' | 'test' | 'deploy'
  projectName: string
  prompt: string
  outcome: string
}

export const forgeTemplates: ForgeTemplate[] = [
  {
    id: 'saas-dashboard',
    title: 'SaaS Dashboard',
    badge: 'Popular',
    pipelineType: 'build',
    projectName: 'SaaS Command Center',
    prompt: 'Build a multi-tenant SaaS dashboard with authentication, billing settings, analytics cards, team management, audit logs, and a polished responsive UI using React, TypeScript, Tailwind, and a Node API.',
    outcome: 'A strong starter for founders, agencies, and internal platform teams.',
  },
  {
    id: 'marketing-site',
    title: 'Marketing Site',
    badge: 'Fast Win',
    pipelineType: 'build',
    projectName: 'Launch Microsite',
    prompt: 'Build a high-converting marketing site with a hero section, pricing, testimonials, FAQ, contact form, and SEO-friendly pages for a B2B software product.',
    outcome: 'Useful for demos, launches, and client deliverables.',
  },
  {
    id: 'internal-tool',
    title: 'Internal Tool',
    badge: 'Ops',
    pipelineType: 'enhance',
    projectName: 'Operations Console',
    prompt: 'Create an internal operations tool for managing tickets, customer records, approvals, and reporting with role-based UI, table views, filters, and activity history.',
    outcome: 'A clear business-use case that feels easy to buy.',
  },
  {
    id: 'rest-api',
    title: 'REST API',
    badge: 'Backend',
    pipelineType: 'build',
    projectName: 'Service API',
    prompt: 'Build a production-style REST API with authentication, CRUD endpoints, request validation, OpenAPI documentation, health checks, tests, Docker support, and CI.',
    outcome: 'Great for technical buyers who want reliable scaffolding.',
  },
  {
    id: 'bug-fix',
    title: 'Bug Fix Sprint',
    badge: 'Diagnostic',
    pipelineType: 'diagnostic',
    projectName: 'Critical Fix',
    prompt: 'Users cannot complete checkout after entering card details. Trace the issue, identify the root cause, and produce the smallest safe fix with verification steps.',
    outcome: 'Shows fast turnaround and practical debugging value.',
  },
  {
    id: 'deployment-pack',
    title: 'Deployment Pack',
    badge: 'DevOps',
    pipelineType: 'deploy',
    projectName: 'Deployment Upgrade',
    prompt: 'Generate deployment configuration for a web app targeting Vercel for frontend, Railway for backend, and Postgres. Include Docker, CI, environment variable docs, and release notes.',
    outcome: 'Turns generated code into something teams can actually ship.',
  },
]

export const forgeDeliveryPromises = [
  'Repo-aware build and debug flows that clone a GitLab project, inspect conventions, and generate a merge-request-ready diff',
  'Verification gates for generated files, dependency repair, build checks, delivery guard, and preview readiness',
  'Run history with logs, cost breakdowns, approvals, rejection handling, and shareable delivery summaries',
]

export const forgeTrustSignals = [
  'Human approval before plan execution and before merge-request publish',
  'Measured token/cost reporting with model, backend, and pricing-source details',
  'Atomic run claiming, ownership checks, persisted handoff data, and path containment for generated files',
]

export const forgeSamplePrompts = [
  'Build a donor management app for a nonprofit with reporting and role-based access.',
  'Add Stripe billing, onboarding, and account settings to an existing SaaS dashboard.',
  'Generate tests for a React app with forms, tables, and API mocks.',
  'Diagnose why login works locally but fails in production after deployment.',
]

export const forgeBuyerPersonas = [
  {
    title: 'Founder MVP Delivery',
    description: 'Turn a scoped product idea into a runnable repo with generated files, verification results, and a clear handoff path.',
  },
  {
    title: 'Agency Build Bench',
    description: 'Create client-ready feature branches, run summaries, and launch artifacts while keeping humans in the approval loop.',
  },
  {
    title: 'Engineering Backlog Relief',
    description: 'Use diagnostic and enhancement pipelines to trace bugs, plan targeted fixes, and verify the final code path.',
  },
]

export const forgeBetaPlans = [
  {
    name: 'Local Demo',
    price: '$0 platform fee',
    audience: 'Interview/demo use on this machine',
    highlight: 'You pay only your configured model/provider costs. Local Ollama runs show as free local API cost; hardware and electricity are not included.',
  },
  {
    name: 'Anthropic API',
    price: 'Haiku $1/$5, Sonnet $3/$15, Opus $5/$25 per MTok',
    audience: 'Production-quality build/debug runs using Claude',
    highlight: 'Rates are input/output per million tokens from Anthropic list pricing. Cache, batch, data residency, tools, taxes, and provider markup can change the bill.',
  },
  {
    name: 'Tracked Controls',
    price: '$5/run and $20/day default guardrails',
    audience: 'Teams that need cost visibility before approving more work',
    highlight: 'Budgets are configurable with FORGE_RUN_BUDGET_USD and FORGE_DAILY_BUDGET_USD. Each run reports measured tokens, model, backend, and stage-level API cost.',
  },
]

export const forgeBetaPromises = [
  'Clone repo',
  'Verify output',
  'Track cost',
]
