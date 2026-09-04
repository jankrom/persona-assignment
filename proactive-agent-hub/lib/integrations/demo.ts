import type { ActionResult, AgentAction, IntegrationAdapter, NormalizedEvent } from "./types";

abstract class ConfirmationGatedAdapter implements IntegrationAdapter {
  abstract readonly id: string;
  abstract readonly capabilities: readonly string[];
  abstract normalize(payload: unknown): NormalizedEvent;
  async executeAction(action: AgentAction): Promise<ActionResult> {
    if (!this.capabilities.includes(action.type)) return { success: false, message: "Capability is not declared by this integration." };
    return { success: true, message: `Demo ${action.type} completed.` };
  }
}

export class GmailDemoAdapter extends ConfirmationGatedAdapter {
  readonly id = "gmail";
  readonly capabilities = ["read_email", "reply_email", "archive_email"] as const;
  normalize(payload: unknown): NormalizedEvent {
    const source = payload as { id: string; from: string; subject: string; body: string; timestamp?: number };
    return { externalId: source.id, integrationId: this.id, type: "gmail.email_received", timestamp: source.timestamp ?? Date.now(), actorName: source.from, title: source.subject, content: source.body, metadataJson: "{}" };
  }
}

export class CalendarDemoAdapter extends ConfirmationGatedAdapter {
  readonly id = "calendar";
  readonly capabilities = ["find_availability", "create_event", "update_event"] as const;
  normalize(payload: unknown): NormalizedEvent {
    const source = payload as { id: string; title: string; detail: string; timestamp?: number };
    return { externalId: source.id, integrationId: this.id, type: "calendar.event_starting", timestamp: source.timestamp ?? Date.now(), title: source.title, content: source.detail, metadataJson: "{}" };
  }
}

export class DoorDashDemoAdapter extends ConfirmationGatedAdapter {
  readonly id = "doordash";
  readonly capabilities = ["read_order_history", "place_mock_order"] as const;
  normalize(payload: unknown): NormalizedEvent {
    const source = payload as { id: string; title: string; detail: string; timestamp?: number };
    return { externalId: source.id, integrationId: this.id, type: "doordash.meal_time_trigger", timestamp: source.timestamp ?? Date.now(), title: source.title, content: source.detail, metadataJson: "{}" };
  }
  async poll(): Promise<NormalizedEvent[]> { return []; }
  override async executeAction(action: AgentAction): Promise<ActionResult> {
    if (action.type !== "place_mock_order") return { success: false, message: "Unsupported mock action." };
    return { success: true, message: "Mock order placed. No charge was made." };
  }
}

export const integrations = { gmail: new GmailDemoAdapter(), calendar: new CalendarDemoAdapter(), doordash: new DoorDashDemoAdapter() };
