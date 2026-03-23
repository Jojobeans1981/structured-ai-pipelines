import { z } from 'zod'

export const ConventionsProfileSchema = z.object({
  language: z.string(),
  additionalLanguages: z.array(z.string()),
  framework: z.string().nullish(),
  packageManager: z.string().nullish(),
  testRunner: z.string().nullish(),
  lintCommand: z.string().nullish(),
  testCommand: z.string().nullish(),
  buildCommand: z.string().nullish(),
  ciConfig: z.string().nullish(),
  directoryStructure: z.string(),
  namingConventions: z.object({
    files: z.string(),
    functions: z.string(),
  }),
  codeStyleSamples: z.array(z.string()),
  lintConfig: z.string().nullish(),
})

export type ConventionsProfile = z.infer<typeof ConventionsProfileSchema>
