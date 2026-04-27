import { describe, expect, it } from 'vitest'
import { safeRepoPath } from '../src/services/forge/utils/repo'

describe('Forge repo path safety', () => {
  const root = 'C:\\tmp\\forge-run'

  it('resolves normal repo-relative paths inside the work directory', () => {
    const resolved = safeRepoPath(root, 'src/App.tsx')
    expect(resolved.replace(/\\/g, '/')).toMatch(/\/tmp\/forge-run\/src\/App\.tsx$/)
  })

  it('rejects parent directory traversal', () => {
    expect(() => safeRepoPath(root, '../outside.txt')).toThrow(/unsafe repo path/i)
    expect(() => safeRepoPath(root, 'src/../../outside.txt')).toThrow(/unsafe repo path/i)
  })

  it('rejects absolute paths', () => {
    expect(() => safeRepoPath(root, 'C:\\Users\\beame\\.ssh\\id_rsa')).toThrow(/unsafe repo path/i)
    expect(() => safeRepoPath(root, '/etc/passwd')).toThrow(/unsafe repo path/i)
  })
})
