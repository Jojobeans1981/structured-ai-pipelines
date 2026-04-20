import { prisma } from '@/src/lib/prisma';

export class AgentRouter {
  /**
   * Queries telemetry to find the most efficient agent for a specific task.
   * If an agent historically completes 'React' tasks in 1.2 loops vs another's 3.5, 
   * it automatically routes to the faster agent.
   */
  static async getBestAgent(taskCategory: string, fallbackAgent = 'Claude-3.5-Sonnet'): Promise<string> {
    try {
      const stats = await prisma.pipelineRun.groupBy({
        by: ['targetAgent'],
        where: { 
          taskName: { contains: taskCategory }, 
          success: true 
        },
        _avg: { iterations: true },
        orderBy: { _avg: { iterations: 'asc' } },
        take: 1,
      });

      if (stats.length > 0 && stats[0].targetAgent) {
        const bestAgent = stats[0].targetAgent;
        const avgLoops = stats[0]._avg.iterations?.toFixed(2);
        console.log(`[AgentRouter] í·  Telemetry indicates ${bestAgent} is best for '${taskCategory}' (Avg Iterations: ${avgLoops})`);
        return bestAgent;
      }
    } catch (e) {
      console.warn('[AgentRouter] DB unreachable, using fallback.');
    }

    console.log(`[AgentRouter] No historical data for '${taskCategory}'. Defaulting to ${fallbackAgent}.`);
    return fallbackAgent;
  }
}
