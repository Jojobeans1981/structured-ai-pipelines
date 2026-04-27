import { afterEach, describe, expect, it } from 'vitest'
import { validateGitLabRepoUrl } from '../src/services/forge/utils/repo'

describe('Forge GitLab repo URL validation', () => {
  const originalAllowedHosts = process.env.GITLAB_ALLOWED_HOSTS

  afterEach(() => {
    if (originalAllowedHosts === undefined) {
      delete process.env.GITLAB_ALLOWED_HOSTS
    } else {
      process.env.GITLAB_ALLOWED_HOSTS = originalAllowedHosts
    }
  })

  it('accepts GitLab HTTPS URLs with nested groups', () => {
    expect(validateGitLabRepoUrl('https://gitlab.com/group/subgroup/project.git')).toBe(
      'https://gitlab.com/group/subgroup/project.git',
    )
  })

  it('accepts configured self-hosted GitLab hosts', () => {
    process.env.GITLAB_ALLOWED_HOSTS = 'git.example.com'

    expect(validateGitLabRepoUrl('https://git.example.com/team/project')).toBe(
      'https://git.example.com/team/project',
    )
  })

  it('rejects unsupported protocols and credentialed URLs', () => {
    expect(() => validateGitLabRepoUrl('http://gitlab.com/group/project')).toThrow(/https/i)
    expect(() => validateGitLabRepoUrl('ssh://git@gitlab.com/group/project')).toThrow(/https/i)
    expect(() => validateGitLabRepoUrl('https://token@gitlab.com/group/project')).toThrow(/https/i)
  })

  it('rejects private/local hosts and public hosts outside the GitLab allowlist', () => {
    expect(() => validateGitLabRepoUrl('https://localhost/group/project')).toThrow(/gitlab repo url/i)
    expect(() => validateGitLabRepoUrl('https://127.0.0.1/group/project')).toThrow(/gitlab repo url/i)
    expect(() => validateGitLabRepoUrl('https://github.com/group/project')).toThrow(/gitlab repo url/i)
  })

  it('requires a group and project path', () => {
    expect(() => validateGitLabRepoUrl('https://gitlab.com/group')).toThrow(/group and project/i)
  })
})
