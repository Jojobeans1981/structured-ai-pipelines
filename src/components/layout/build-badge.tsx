function readBuildMetadata() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || ''
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || ''
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown'
  const url = process.env.VERCEL_URL || ''

  return {
    sha: sha ? sha.slice(0, 7) : 'local',
    branch: branch || 'workspace',
    env,
    url,
  }
}

function normalizeEnv(rawEnv: string): string {
  const value = rawEnv.trim().toLowerCase()

  if (!value) return 'unknown'
  if (value === 'production' || value.includes('prod')) return 'production'
  if (value === 'preview') return 'preview'
  if (value === 'development' || value.includes('dev')) return 'development'
  if (value === 'test') return 'test'

  return value
}

function readAccessMode() {
  const authBypass = true
  const forgeGuest = process.env.FORGE_GUEST_ACCESS?.trim().toLowerCase()

  if (authBypass) return 'demo'
  if (forgeGuest === 'true') return 'guest'
  return 'authenticated'
}

export function BuildBadge() {
  const build = readBuildMetadata()
  const deployEnv = normalizeEnv(build.env)
  const accessMode = readAccessMode()

  return (
    <div className="fixed bottom-3 right-3 z-40 rounded-lg border border-orange-900/40 bg-zinc-950/85 px-3 py-2 text-[11px] text-zinc-300 shadow-lg backdrop-blur">
      <div className="font-semibold text-orange-300">Build</div>
      <div>
        <span className="text-zinc-500">deploy:</span> {deployEnv}
      </div>
      <div>
        <span className="text-zinc-500">branch:</span> {build.branch}
      </div>
      <div>
        <span className="text-zinc-500">sha:</span> {build.sha}
      </div>
      <div>
        <span className="text-zinc-500">access:</span> {accessMode}
      </div>
      <div className="text-zinc-500">
        {accessMode === 'demo' ? 'login intentionally disabled for testers' : 'standard access controls active'}
      </div>
      {build.url && (
        <div className="max-w-[220px] truncate text-zinc-500" title={build.url}>
          {build.url}
        </div>
      )}
    </div>
  )
}
