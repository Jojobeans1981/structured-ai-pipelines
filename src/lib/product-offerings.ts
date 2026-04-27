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
    name: 'Launch Sprint',
    price: '$1,500 / project',
    audience: 'Founders and teams that need one scoped feature, bug fix, or readiness pass delivered as a reviewed branch.',
    highlight: 'Best for interview-style demos, MVP slices, and client proofs. Estimated savings: $2,000-$5,000 versus 1-2 days of senior engineering time for discovery, scaffolding, debugging, and handoff prep.',
  },
  {
    name: 'Team Workflow',
    price: '$4,500 / month',
    audience: 'Engineering teams with recurring backlog work, internal tools, tests, and small product enhancements.',
    highlight: 'Includes up to 20 guided Forge runs with approval gates, run history, cost reporting, and delivery summaries. Estimated savings: 40-80 engineering hours per month, or about $6,000-$12,000 in preserved capacity at $150/hour.',
  },
  {
    name: 'Enterprise Delivery',
    price: 'Custom',
    audience: 'Organizations that need governed rollout, repository controls, audit-friendly evidence, and private workflow support.',
    highlight: 'Designed for higher-volume engineering operations with SSO, policy controls, custom budgets, deployment rules, and reporting. Savings model is scoped against your team cost, run volume, and review requirements.',
  },
]

export const forgeBetaPromises = [
  'Clone repo',
  'Verify output',
  'Track cost',
]

export const forgeSavingsProof = {
  title: 'Savings example',
  metric: '$7,500 net capacity preserved',
  scenario:
    '20 routine fixes or feature slices per month x 4 engineer hours saved x $150/hour = $12,000 of engineering capacity protected.',
  note:
    'Against the $4,500/month Team Workflow plan, that leaves about $7,500 in estimated net capacity before infrastructure, API usage, and final human review. Actual savings vary by repo complexity, review depth, provider usage, and team process.',
}
