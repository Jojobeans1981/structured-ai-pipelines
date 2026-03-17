export type ProjectStatus = 'active' | 'completed' | 'archived';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  lastRunStatus: string | null;
  lastRunType: string | null;
}
