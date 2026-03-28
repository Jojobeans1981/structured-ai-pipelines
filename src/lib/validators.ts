import { z } from 'zod';

export const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required').startsWith('sk-', 'Invalid Anthropic API key format'),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().default(''),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
});

export const startPipelineSchema = z.object({
  type: z.enum(['build', 'diagnostic', 'refactor', 'enhance', 'test', 'deploy']),
  input: z.string().min(1, 'Input is required'),
  mode: z.enum(['linear', 'dag']).optional(),
  autoApprove: z.boolean().optional(),
});

export const approveStageSchema = z.object({
  editedContent: z.string().optional(),
});

export const rejectStageSchema = z.object({
  feedback: z.string().min(1, 'Feedback is required'),
});
