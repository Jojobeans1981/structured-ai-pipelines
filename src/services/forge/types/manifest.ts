export interface ManifestFile {
  path: string
  description: string
  dependencies: string[]
}

export interface ImplementationManifest {
  files: ManifestFile[]
}
