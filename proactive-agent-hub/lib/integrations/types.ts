export type NormalizedEvent = {
  externalId: string;
  integrationId: string;
  type: string;
  timestamp: number;
  actorName?: string;
  title: string;
  content: string;
  metadataJson: string;
};

export type AgentAction = { integrationId: string; type: string; parameters: Record<string, unknown> };
export type ActionResult = { success: boolean; message: string };

export interface IntegrationAdapter {
  readonly id: string;
  readonly capabilities: readonly string[];
  normalize(payload: unknown): NormalizedEvent;
  poll?(): Promise<NormalizedEvent[]>;
  executeAction(action: AgentAction): Promise<ActionResult>;
}
