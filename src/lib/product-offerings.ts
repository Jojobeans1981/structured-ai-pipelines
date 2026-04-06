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
  'Guided pipeline setup with starter prompts and templates',
  'Verified output with build, test, and security checks where available',
  'Exportable artifacts like ZIP, setup guide, and run summary',
]

export const forgeTrustSignals = [
  'Launch-ready setup guidance',
  'Traceable pipeline history',
  'Verification and readiness reporting',
]

export const forgeSamplePrompts = [
  'Build a donor management app for a nonprofit with reporting and role-based access.',
  'Add Stripe billing, onboarding, and account settings to an existing SaaS dashboard.',
  'Generate tests for a React app with forms, tables, and API mocks.',
  'Diagnose why login works locally but fails in production after deployment.',
]

export const forgeBuyerPersonas = [
  {
    title: 'Founder Fast Track',
    description: 'Turn product ideas into demos, internal tools, and MVP scaffolds without waiting on a full sprint.',
  },
  {
    title: 'Agency Delivery',
    description: 'Generate polished starter projects, reports, and handoff assets that help client work move faster.',
  },
  {
    title: 'Engineering Backlog Relief',
    description: 'Use diagnostic and enhancement pipelines to shrink bug-fix, testing, and deployment setup work.',
  },
]

export const forgeBetaPlans = [
  {
    name: 'Starter',
    price: 'Launch Access',
    audience: 'Solo builders and evaluation runs',
    highlight: 'Prompt library, guided runs, and baseline exports',
  },
  {
    name: 'Studio',
    price: 'Studio Range',
    audience: 'Founders, agencies, and operators shipping multiple projects',
    highlight: 'Guided builds, exports, and launch-readiness workflows',
  },
  {
    name: 'Team Workspace',
    price: 'Workspace Range',
    audience: 'Product and engineering teams that need collaboration and controls',
    highlight: 'Shared projects, approvals, usage controls, and deploy flows',
  },
]

export const forgeBetaPromises = [
  'Access',
  'Templates',
  'Delivery',
]
