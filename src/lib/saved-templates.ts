export interface SavedForgeTemplate {
  id: string
  title: string
  pipelineType: 'build' | 'diagnostic' | 'refactor' | 'enhance' | 'test' | 'deploy'
  prompt: string
  projectName?: string
}

const STORAGE_KEY = 'forge.saved-templates.v1'

export function loadSavedTemplates(): SavedForgeTemplate[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSavedTemplates(templates: SavedForgeTemplate[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}
