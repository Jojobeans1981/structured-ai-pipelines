function readBuildMetadata() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || ''
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || ''
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown'
  const url = process.env.VERCEL_URL || ''
  const bypassRaw = process.env.AUTH_BYPASS_DEMO?.trim().toLowerCase()
  const demoAuthEnabled =
    bypassRaw === 'true' ? true : bypassRaw === 'false' ? false : process.env.NODE_ENV !== 'production'

  return {
    sha: sha ? sha.slice(0, 7) : 'local',
    branch: branch || 'workspace',
    env,
    url,
    demoAuthEnabled,
  }
}

export function BuildBadge() {
  const build = readBuildMetadata()

  return (
    <div className="fixed bottom-3 right-3 z-40 rounded-lg border border-orange-900/40 bg-zinc-950/85 px-3 py-2 text-[11px] text-zinc-300 shadow-lg backdrop-blur">
      <div className="font-semibold text-orange-300">Build</div>
      <div>
        <span className="text-zinc-500">env:</span> {build.env}
      </div>
      <div>
        <span className="text-zinc-500">branch:</span> {build.branch}
      </div>
      <div>
        <span className="text-zinc-500">sha:</span> {build.sha}
      </div>
      <div>
        <span className="text-zinc-500">demo auth:</span> {build.demoAuthEnabled ? 'on' : 'off'}
      </div>
      {build.url && (
        <div className="max-w-[220px] truncate text-zinc-500" title={build.url}>
          {build.url}
        </div>
      )}
    </div>
  )
}
