export class AgentRouter {
  /**
   * Returns the configured fallback agent until agent telemetry has a dedicated schema.
   */
  static async getBestAgent(taskCategory: string, fallbackAgent = 'Claude-3.5-Sonnet'): Promise<string> {
    console.log(`[AgentRouter] No historical data for '${taskCategory}'. Defaulting to ${fallbackAgent}.`);
    return fallbackAgent;
  }
}
