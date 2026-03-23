import { Gitlab } from '@gitbeaker/rest'
import simpleGit from 'simple-git'
import { prisma } from '@/src/lib/prisma'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export interface PublishOptions {
  workDir: string
  repoUrl: string
  files: Array<{ path: string; content: string }>
  branchName?: string
  title: string
  description: string
  token: string
}

export interface PublishResult {
  mrUrl: string
  mrIid: number
  branch: string
  title: string
}

export async function getGitLabToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'gitlab' },
    select: { access_token: true },
  })

  if (!account?.access_token) {
    throw new Error('No GitLab account linked. Please re-authenticate with GitLab.')
  }

  return account.access_token
}

export async function publishToGitLab(opts: PublishOptions): Promise<PublishResult> {
  const { workDir, repoUrl, files, title, description, token } = opts

  // Parse repo URL to extract host and project path
  const cleanUrl = repoUrl.replace(/\.git$/, '')
  const url = new URL(cleanUrl)
  const host = url.origin
  const projectPath = url.pathname.slice(1) // remove leading /

  console.log(`[Publish] Publishing to ${host} / ${projectPath}`)

  // Create Gitbeaker client
  const gl = new Gitlab({ host, token })

  // Get the repo's default branch
  const project = await gl.Projects.show(projectPath)
  const targetBranch = project.default_branch || 'main'

  // Generate branch name if not provided
  const branch = opts.branchName || `forge/${Date.now().toString(36)}`

  // Git operations
  const git = simpleGit(workDir)
  await git.checkoutLocalBranch(branch)

  // Write all files
  for (const file of files) {
    const fullPath = join(workDir, file.path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, file.content, 'utf-8')
  }

  // Stage, commit, push
  await git.add('.')
  await git.commit(`forge: ${title}`)
  await git.push('origin', branch)

  console.log(`[Publish] Pushed branch ${branch}`)

  // Create merge request
  const mr = await gl.MergeRequests.create(
    projectPath,
    branch,
    targetBranch,
    title,
    { description, removeSourceBranch: true },
  )

  console.log(`[Publish] Created MR !${mr.iid}: ${mr.web_url}`)

  return {
    mrUrl: mr.web_url,
    mrIid: mr.iid,
    branch,
    title,
  }
}
