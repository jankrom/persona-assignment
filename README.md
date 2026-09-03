# Proactive Agent — Design Doc

## 1. Overview

Build a web app for a proactive personal agent.

The agent connects to external services, watches for new information, decides what deserves the user’s attention, suggests useful actions, and learns from user behavior over time.

The product has three main surfaces:

- **Inbox** — primary feed of proactive updates and suggested actions
- **Chat** — direct conversation with the agent
- **Connections** — manage integrations, permissions, and connection state

The demo supports:

- Gmail
- Google Calendar
- Mock DoorDash

The architecture should allow additional integrations without changing the core agent pipeline.

The core product principle is:

> **Optimize for precision, not activity.**

A proactive agent should frequently decide to do nothing. The goal is not to generate more notifications. The goal is to surface fewer, higher-value items.

### High-Level Product Loop

```text
Connected Service
      │
      ▼
External Event
      │
      ▼
Normalize + Deduplicate
      │
      ▼
Retrieve Context + Memory
      │
      ▼
Agent Evaluation
      │
      ├── Importance
      ├── Confidence
      └── Urgency
      │
      ▼
Policy Layer
      │
      ├── Ignore
      ├── Inbox
      └── Inbox + Notification
             │
             ▼
        User Feedback
             │
             ├── Action
             └── Learning
```

The agent watches connected services, decides what deserves attention, proposes useful actions, and improves from user behavior.

### High-Level Architecture

```text
                 ┌──────────────────┐
                 │     Web App      │
                 │                  │
                 │ Inbox            │
                 │ Chat             │
                 │ Connections      │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │    API Server    │
                 └────────┬─────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
 Integration Layer   Agent Runtime    Memory Service
         │                │                │
         ▼                ▼                ▼
 Gmail / Calendar    Decision Engine   Global Memory
 Mock DoorDash       Action Planner    App Memory
         │
         ▼
 Event Ingestion
 Webhooks + Polling
         │
         ▼
 Normalized Events
         │
         ▼
 Agent Evaluation
         │
         ▼
 Importance + Confidence + Urgency
         │
         ▼
 Policy Layer
         │
         ├── Ignore
         ├── Inbox
         └── Inbox + Notification
```

Provider-specific logic stays inside integration adapters. The agent consumes normalized events and shared capabilities.

Chat and Inbox use the same agent runtime, memory, and tools.

---

## 2. Goals

The system should:

1. Ingest information from connected services.
2. Proactively surface useful information.
3. Filter low-value events instead of forwarding every notification.
4. Distinguish between information worth storing in Inbox and information worth interrupting the user about.
5. Allow the agent to take actions on behalf of the user.
6. Learn from explicit and implicit user feedback.
7. Maintain both global and integration-specific memory.
8. Support webhook-based and polling-based integrations.
9. Support reasoning across multiple integrations.
10. Make new integrations easy to add.
11. Persist feed state, interaction history, and learned preferences.

### Non-goals

For the demo:

- Full DoorDash integration.
- Autonomous financial or destructive actions.
- Large-scale distributed infrastructure.
- Sophisticated production memory retrieval.
- Fully autonomous external write actions.

---

## 3. User Experience

### Inbox

Inbox is the default page.

Each feed item represents something the agent decided was relevant.

Example:

**Gmail**

> Sarah asked if you are free Thursday afternoon. Your calendar is open after 3 PM. Want me to reply that you are available?

Actions:

- Yes
- Edit
- No

**Calendar**

> Your meeting with Alex starts in 30 minutes. The main unresolved question from the email thread is pricing.

Actions:

- View summary
- Dismiss

**DoorDash**

> You usually order lunch around this time. Reorder your usual Sweetgreen bowl?

Actions:

- Order
- Change
- No

For DoorDash, confirming an order returns a mocked successful order instead of calling a real DoorDash API.

---

### Chat

Chat provides direct interaction with the same agent used by Inbox.

Examples:

> What do I have tomorrow?

> Reply to Sarah and tell her 3:30 works.

> Stop showing me promotional emails.

> Order my usual lunch.

Chat and Inbox share:

- memory
- tools
- integrations
- permissions
- recent interaction history

The system should not maintain separate “chat intelligence” and “proactive intelligence.”

They are two entry points into the same agent runtime.

---

### Connections

Connections shows available integrations.

Each integration displays:

- connection status
- last successful sync
- permissions
- available capabilities
- sync method
- disconnect option

Example:

```text
Gmail
Connected
Last synced: 12 seconds ago
Webhook enabled

Google Calendar
Connected
Last synced: 8 seconds ago
Webhook enabled

DoorDash
Demo integration
Polling every 30 seconds
```

---

## 4. Integration Model

Each connected service is implemented as an integration adapter with:

- metadata
- connection state
- sync state
- capabilities
- integration-specific memory
- event normalization
- action execution

Example structure:

```text
integrations/
  gmail/
    adapter
    config
    metadata
    tools

  calendar/
    adapter
    config
    metadata
    tools

  doordash/
    adapter
    config
    metadata
    tools
```

Integration-specific memory is stored separately from adapter code.

Each integration implements a common interface.

```typescript
interface Integration {
  getMetadata(): IntegrationMetadata

  poll?(): Promise<ExternalEvent[]>

  handleWebhook?(
    payload: unknown
  ): Promise<ExternalEvent[]>

  executeAction(
    action: AgentAction
  ): Promise<ActionResult>
}
```

This keeps provider-specific logic at the edge of the system.

The agent runtime should not depend directly on Gmail, Calendar, or DoorDash implementation details.

---

## 5. Integration Metadata

Each integration stores structured operational metadata.

Example:

```json
{
  "id": "gmail",
  "name": "Gmail",
  "status": "connected",
  "syncMode": "webhook",
  "lastSyncAt": "2026-09-03T20:00:00Z",
  "capabilities": [
    "read_email",
    "send_email",
    "reply_email"
  ]
}
```

Operational metadata and user memory should remain separate.

Metadata answers:

> What can this integration do?

Memory answers:

> How does this user prefer the integration to behave?

---

## 6. Event Ingestion

External information enters through two paths.

### Webhooks

Use push-based events where supported.

```text
External Service
      │
      ▼
Webhook Endpoint
      │
      ▼
Integration Adapter
      │
      ▼
Normalized Event
```

### Polling

Services without usable webhooks are polled every 30 seconds for the demo.

```text
Scheduler
   │
   │ every 30 seconds
   ▼
Integration.poll()
   │
   ▼
New Events
```

Each poller stores a cursor, timestamp, or provider-specific token.

Example:

```json
{
  "integration": "doordash",
  "lastCursor": "event_182",
  "lastPolledAt": "2026-09-03T20:14:30Z"
}
```

Previously processed events should not be emitted again.

---

## 7. Normalized Event Model

All integrations convert external information into a common event format.

```typescript
interface AgentEvent {
  id: string
  integrationId: string
  type: string
  timestamp: string

  actor?: {
    id?: string
    name?: string
  }

  title: string
  content: string

  rawReference?: string
  metadata: Record<string, unknown>
}
```

Examples:

```text
gmail.email_received
calendar.event_created
calendar.event_starting
doordash.meal_time_trigger
```

The agent runtime consumes `AgentEvent`.

It does not need to know how the event was retrieved.

---

## 8. Immutable Event History

Events should be immutable.

An event records that something happened.

The system stores later decisions and actions separately.

```text
Event
  ↓
Agent Decision
  ↓
Inbox Item
  ↓
Proposed Action
  ↓
User Feedback
  ↓
Action Result
```

This provides a clear audit trail and prevents later processing from overwriting source information.

---

## 9. Idempotency and Deduplication

Webhook retries and polling can produce duplicate events.

Each normalized event should have a stable deduplication key.

Example:

```text
gmail:{message_id}
calendar:{event_id}:{updated_at}
doordash:{mock_event_id}
```

Before processing an event:

```text
Receive Event
    │
    ▼
Check Deduplication Key
    │
    ├── already processed → ignore
    │
    └── new → process
```

Actions should also use idempotency keys when supported.

This is especially important for external side effects.

Showing the same notification twice is annoying.

Sending the same email twice is unacceptable.

---

## 10. Proactive Decision Pipeline

Receiving an event does not automatically create an Inbox item.

The system evaluates whether the event is useful enough to surface.

```text
New Event
   │
   ▼
Cheap Filtering
   │
   ▼
Load Relevant Context
   │
   ├── Global memory
   ├── Integration memory
   ├── Recent interaction history
   └── Relevant external context
   │
   ▼
Agent Evaluation
   │
   ├── Importance
   ├── Confidence
   └── Urgency
   │
   ▼
Policy Layer
   │
   ├── Ignore
   ├── Inbox
   └── Inbox + Notification
```

The agent produces scores rather than directly controlling notification behavior.

---

## 11. Importance, Confidence, and Urgency

Each proactive decision contains three independent scores from `0.0` to `1.0`.

### Importance

How valuable is this information to the user?

Examples:

```text
Flight cancelled               → 0.98
Scheduling request             → 0.75
Promotional newsletter         → 0.15
```

### Confidence

How certain is the system that it correctly understood the event and its relevance?

Examples:

```text
Explicit cancelled flight      → 0.99
Clear meeting request          → 0.90
Ambiguous casual email         → 0.55
```

Confidence is not the same as importance.

Something can be confidently unimportant.

### Urgency

How quickly does the user need to know or act?

Examples:

```text
Meeting starts in 10 minutes   → 0.95
Meeting request for next week  → 0.30
Newsletter                     → 0.10
```

---

## 12. Agent Decision Model

The agent returns structured output.

```typescript
interface AgentDecision {
  importance: number
  confidence: number
  urgency: number

  reason: string

  message?: string
  proposedAction?: AgentAction
}
```

The model does not directly decide whether to send a push notification.

Application policy interprets these scores.

---

## 13. Inbox and Notification Policy

For the demo, use deterministic thresholds.

Example:

```text
importance < 0.50
→ Ignore

importance >= 0.50
→ Add to Inbox

importance >= 0.80
AND urgency >= 0.70
AND confidence >= 0.70
→ Add to Inbox + send notification
```

These thresholds are configurable.

The key distinction is:

```text
Should this exist in the Inbox?

        ↓ yes

Is this important enough to interrupt the user?
```

Inbox is a lower bar than notification.

A useful but non-urgent event can remain available without interrupting the user.

---

## 14. Decision Examples

### High Importance, High Urgency

```text
"Your flight was cancelled."

importance: 0.98
confidence: 0.99
urgency: 0.98

→ Inbox + Notification
```

### Moderate Importance, Low Urgency

```text
"Sarah asked whether you want to get coffee next week."

importance: 0.65
confidence: 0.90
urgency: 0.25

→ Inbox
```

### High Confidence, Low Importance

```text
"20% off Nike this weekend."

importance: 0.15
confidence: 0.99
urgency: 0.20

→ Ignore
```

### Important but Uncertain

```text
"This email may be asking you to reschedule tomorrow's meeting."

importance: 0.78
confidence: 0.52
urgency: 0.65
```

The system can surface this conservatively in Inbox without sending an interruption.

---

## 15. Memory Influence on Relevance

Memory should affect the proactive scores.

Example:

```text
Base importance:
Promotional email = 0.55
```

Memory contains:

```text
User does not want promotional emails surfaced.
```

Adjusted result:

```text
importance: 0.12

→ Ignore
```

Positive behavior can also increase relevance.

Example:

```text
Base importance:
Lunch reorder suggestion = 0.55

Memory:
User accepts lunch reorder suggestions frequently.

Adjusted importance: 0.73

→ Inbox
```

The system should not rely entirely on model intuition.

Past user behavior should influence future decisions.

---

## 16. Cross-Integration Reasoning

Integrations should not be isolated from each other.

An event from one integration can trigger reads or actions in another.

Example:

```text
Gmail
"Can we meet tomorrow?"
       │
       ▼
Agent
       │
       ├── Gmail thread
       ├── Calendar availability
       └── scheduling preferences
       │
       ▼
"You're free at 3:30 PM. Reply?"
```

The Gmail adapter owns Gmail-specific connection and sync logic.

The agent is free to compose Gmail and Calendar capabilities.

---

## 17. Actions

Integrations expose actions the agent can execute.

### Gmail

```text
send_email
reply_email
archive_email
```

### Calendar

```text
create_event
update_event
delete_event
```

### Mock DoorDash

```text
place_mock_order
```

The agent creates an action proposal.

Example:

```json
{
  "integrationId": "gmail",
  "action": "reply_email",
  "parameters": {
    "threadId": "thread_123",
    "body": "3:30 works for me."
  }
}
```

The user approves it.

```text
Inbox
   │
   │ Yes
   ▼
Action Executor
   │
   ▼
Validation
   │
   ▼
Gmail Integration
   │
   ▼
Gmail API
```

For the demo, all external write actions require confirmation.

---

## 18. Action Lifecycle

Each proposed action has explicit state.

```text
proposed
   ↓
approved
   ↓
executing
   ↓
succeeded / failed
```

Example:

```typescript
interface ActionRecord {
  id: string
  integrationId: string
  type: string
  parameters: Record<string, unknown>

  status:
    | "proposed"
    | "approved"
    | "executing"
    | "succeeded"
    | "failed"

  idempotencyKey?: string
}
```

This makes retries and failures easier to reason about.

---

## 19. Memory Model

Memory has three layers:

1. interaction log
2. integration memory
3. global memory

---

### Interaction Log

The interaction log stores raw evidence.

Examples:

```text
User dismissed promotional email suggestion.
User approved meeting reply.
User changed suggested meeting time from 3:00 to 3:30.
User rejected lunch suggestion.
User accepted Sweetgreen reorder.
```

The log is append-only.

The agent should not load the entire log into context.

---

### Integration Memory

Each integration has a logical `memory.md`.

Example:

```text
# Gmail Preferences

- User does not want promotional newsletters surfaced.
- User wants emails from direct coworkers prioritized.
- User usually wants scheduling emails cross-checked against Calendar.
- User prefers short email replies.
```

DoorDash:

```text
# DoorDash Preferences

- User often orders lunch between 12:00 PM and 1:00 PM.
- User frequently orders Sweetgreen.
- User rejected dinner suggestions three times this week.
```

---

### Global Memory

Global `memory.md` stores preferences that apply across services.

```text
# User Memory

- User prefers concise responses.
- User does not want unnecessary notifications.
- User prefers suggested actions when confidence is high.
- User normally schedules meetings for 30 minutes.
```

---

## 20. Memory Distillation

Raw interaction history and persistent memory serve different purposes.

```text
User Interaction
      │
      ▼
Interaction Log
      │
      ▼
Memory Distillation
      │
      ├── Integration Memory
      └── Global Memory
```

The system should not write every interaction directly into memory.

Example raw history:

```text
Dismissed newsletter
Dismissed newsletter
Dismissed newsletter
Dismissed newsletter
```

Distilled memory:

```text
- User does not want promotional newsletters surfaced.
```

Explicit user statements can update memory immediately.

Example:

> Stop showing me promotional emails.

This can directly create or strengthen Gmail-specific memory.

---

## 21. Feedback

Inbox actions provide implicit feedback.

```text
Yes
No
Dismiss
Edit
```

Each action creates a feedback record.

Example:

```json
{
  "type": "agent_feedback",
  "itemId": "inbox_123",
  "response": "rejected",
  "timestamp": "..."
}
```

Edits should be treated as one of the strongest feedback signals.

If the agent suggests:

> 3 PM works for me.

and the user changes it to:

> 3:30 works for me.

store:

- proposed action
- final action
- difference between them

This provides more useful learning data than a simple yes/no signal.

---

## 22. Inbox Data Model

```typescript
interface InboxItem {
  id: string
  eventId?: string

  integrationId: string

  createdAt: string

  importance: number
  confidence: number
  urgency: number

  status:
    | "unread"
    | "read"
    | "dismissed"
    | "completed"

  message: string

  proposedAction?: AgentAction

  feedback?: {
    response: string
    timestamp: string
  }
}
```

Inbox items should persist across refreshes and sessions.

The scores are stored so the system can later analyze and recalibrate proactive behavior.

---

## 23. Chat

Chat uses the same runtime as proactive events.

The difference is the trigger.

Inbox:

```text
External Event → Agent
```

Chat:

```text
User Message → Agent
```

Both have access to:

```text
Global Memory
Integration Memory
Capabilities
Recent Interaction History
Relevant External Context
```

This creates one consistent model of the user.

---

## 24. Example End-to-End Flow

### Scheduling Email

Gmail receives:

> Are you free tomorrow afternoon?

1. Gmail webhook reports a mailbox change.
2. Gmail adapter retrieves the message.
3. Adapter emits `gmail.email_received`.
4. System checks the event deduplication key.
5. Agent loads:
   - Gmail memory
   - global memory
   - relevant Calendar data
6. Agent identifies a scheduling request.
7. Agent checks tomorrow's availability.
8. Agent evaluates the event:

```text
importance: 0.78
confidence: 0.94
urgency: 0.40
```

9. Policy determines that the event belongs in Inbox but does not require a notification.
10. Agent generates:

> Sarah asked if you're free tomorrow afternoon. You're available at 3:30 PM. Want me to reply?

11. Inbox item is created.
12. User selects **Yes**.
13. Proposed action moves to `approved`.
14. Gmail `reply_email` executes.
15. Action result is stored.
16. User interaction is appended to the interaction log.
17. The memory system can use that interaction as evidence for future preferences.

---

## 25. Storage

For the demo, a relational database is sufficient. Using Convex for demo.

Core tables:

```text
users

integrations

integration_sync_state

events

agent_decisions

inbox_items

actions

action_results

conversations

messages

interaction_logs

memories
```

`agent_decisions` stores:

```text
event_id
importance
confidence
urgency
reason
created_at
```

`memories` stores the logical `memory.md` content.

Example:

```text
user_id
scope
integration_id
content
updated_at
```

Where:

```text
scope = global | integration
```

Markdown can be generated or edited as a representation of memory while the database remains the persistent store.

---

## 26. Background Processing

Background workers handle:

- polling
- event normalization
- proactive evaluation
- memory distillation

```text
Scheduler
   │
   ├── Poll integrations
   └── Run memory distillation

Webhooks
   │
   ▼
Event Queue
   │
   ▼
Agent Worker
   │
   ▼
Importance / Confidence / Urgency
   │
   ▼
Policy Layer
   │
   ▼
Inbox / Notification
```

For the demo, this can use a simple job queue or database-backed worker.

---

## 27. Adding a New Integration

Adding a new service should require implementing only the integration adapter.

Example: Slack.

```text
Slack Adapter
    │
    ├── handleWebhook()
    ├── poll() if required
    ├── executeAction()
    ├── metadata
    └── capabilities
```

The rest of the system remains unchanged.

```text
Slack
  ↓
Normalized Event
  ↓
Agent Runtime
  ↓
Relevance Evaluation
  ↓
Inbox
```

---

## 28. Safety and Permissions

External actions can have side effects.

For the demo:

- read operations can execute automatically
- proactive suggestions can appear automatically
- external write actions require user confirmation
- integration credentials remain server-side
- actions must match declared integration capabilities
- application code validates model-generated action arguments
- the model does not receive unrestricted API access

The model proposes an action.

The application decides whether that action is valid and executes it.

---

## 29. Demo Scope

The demo should prove six behaviors.

### Gmail

Receive an email and proactively surface a useful action.

Example:

> This email is asking to schedule a meeting.

Check Calendar and suggest a response.

### Calendar

Surface useful context before an upcoming event.

Example:

> Your meeting starts in 30 minutes. Here are the relevant details from the email thread.

### DoorDash

Generate a proactive suggestion from mock historical behavior.

Example:

> You often order Sweetgreen around this time. Reorder?

The resulting order is mocked.

### Relevance

Demonstrate different proactive outcomes:

```text
Low importance
→ ignored

Useful but not urgent
→ Inbox

Important and urgent
→ Inbox + Notification
```

### Memory

Repeated behavior should change future decisions.

Example:

After repeatedly dismissing promotional emails, their importance score drops below the Inbox threshold.

### Chat

The user can directly request actions through the same agent.

Example:

> Email Sarah and tell her 3:30 works.

---

## 30. Key Design Decisions

### Optimize for precision

The system should prefer missing a marginally useful item over constantly interrupting the user.

### Separate Inbox from notifications

Useful information does not always justify an interruption.

### Use explicit proactive scores

Importance, confidence, and urgency make agent behavior inspectable and tunable.

### Keep thresholds outside the model

The model evaluates the event.

Application policy decides what to do with the result.

### Let memory affect relevance

The same event can have different importance for different users.

### Normalize events before agent processing

Provider-specific ingestion logic stays inside integration adapters.

### Keep events immutable

Events describe external facts.

Agent decisions, Inbox items, actions, and feedback are stored separately.

### Add idempotency at the event and action layers

Retries should not create duplicate Inbox items or duplicate external actions.

### Separate raw history from memory

Interaction logs preserve evidence.

Memory stores distilled preferences.

### Use global and integration-specific memory

Some preferences apply everywhere.

Others only make sense within one service.

### Treat edits as high-value feedback

The difference between the suggested action and final user action contains strong personalization signal.

### Treat Inbox as agent output

Inbox is not a raw notification stream.

### Separate reasoning from execution

The model proposes structured actions.

Application code validates and executes them.

### Allow cross-integration reasoning

Gmail events can query Calendar.

Calendar events can retrieve Gmail context.

### Use one agent runtime for Inbox and Chat

Proactive and reactive interactions should share context, tools, and memory.

---

## 31. Tradeoffs and Production Evolution

The demo favors simplicity and iteration speed.

Several implementation choices would change in a production system.

### Memory

#### Demo

Store distilled preferences in global and integration-specific `memory.md` documents.

```text
memory/
  global.md
  gmail.md
  calendar.md
  doordash.md
```

This is easy to inspect and demonstrate.

#### Production

Memory should become a structured service.

```typescript
interface Memory {
  id: string

  scope: "global" | "integration"
  integrationId?: string

  fact: string

  confidence: number
  evidenceCount: number

  createdAt: string
  updatedAt: string

  sourceInteractionIds: string[]
}
```

Example:

```json
{
  "fact": "User does not want promotional emails surfaced",
  "scope": "integration",
  "integrationId": "gmail",
  "confidence": 0.94,
  "evidenceCount": 8
}
```

Markdown can remain a debugging or model-facing representation.

It should not be the long-term source of truth.

---

### Memory Retrieval

#### Demo

Load global memory and the current integration's memory.

#### Production

Retrieve only memories relevant to the current event.

```text
Incoming Scheduling Email
        │
        ▼
Memory Retrieval
        │
        ├── meeting preferences
        ├── email response preferences
        ├── sender-specific behavior
        └── scheduling history
```

Retrieval can use:

- structured filters
- semantic similarity
- recency
- confidence
- evidence count

---

### Memory Distillation

#### Demo

Periodically inspect recent interaction logs and update memory.

#### Production

Use a separate asynchronous memory pipeline.

```text
Interactions
     │
     ▼
Behavior Aggregator
     │
     ▼
Candidate Memories
     │
     ▼
Memory Evaluator
     │
     ├── create
     ├── strengthen
     ├── weaken
     ├── merge
     └── delete
```

One rejected suggestion should be weak evidence.

Repeated similar behavior should increase confidence.

Explicit statements can create high-confidence memories immediately.

---

### Polling

#### Demo

Poll non-webhook integrations every 30 seconds.

#### Production

Use adaptive polling.

```text
High urgency        → seconds/minutes
Normal activity     → minutes
Low urgency         → hours
Inactive service    → back off further
```

Production polling should support:

- exponential backoff
- jitter
- rate limits
- retries
- incremental sync
- provider-specific cursors

Use push-based events wherever reliable.

---

### Relevance Scoring

#### Demo

Ask the model to produce `importance`, `confidence`, and `urgency`, then apply fixed thresholds.

#### Production

Calibrate scores using observed user behavior.

The system can compare predicted importance against:

- whether the user opened the item
- whether they dismissed it
- whether they approved the action
- how quickly they acted
- whether they later requested the same information manually

Over time, thresholds can become personalized.

Example:

```text
User A prefers frequent proactive updates
Inbox threshold → 0.45

User B dismisses most proactive updates
Inbox threshold → 0.70
```

Notification thresholds can be personalized independently.

The model's score should eventually become an input into a learned ranking or calibration layer rather than the final relevance signal.

---

### Event Processing

#### Demo

Use a database-backed job queue.

#### Production

Use a durable event pipeline.

```text
Integrations
     │
     ▼
Event Ingestion
     │
     ▼
Durable Event Bus
     │
     ├── Agent Evaluation
     ├── Memory Learning
     ├── Analytics
     └── Audit Logging
```

Events should remain immutable and idempotent.

---

### Agent Decisions

#### Demo

Use one model call to generate proactive scores and a suggested response.

#### Production

Use multiple stages.

```text
Event
  │
  ▼
Cheap Relevance Filter
  │
  ▼
Context Retrieval
  │
  ▼
Agent Reasoning
  │
  ▼
Score Calibration
  │
  ▼
Policy Validation
  │
  ▼
Inbox / Notification
```

Most external events should not require expensive model reasoning.

Rules or lightweight models can filter obvious low-value events first.

---

### Actions

#### Demo

All external write actions require confirmation.

#### Production

Actions should have risk levels.

```text
Level 0
Read information
→ automatic

Level 1
Low-risk and reversible
→ potentially automatic

Level 2
External communication
→ confirmation based on policy

Level 3
Financial or destructive action
→ explicit confirmation
```

Users could eventually grant autonomy for specific low-risk actions.

---

### Integration Framework

#### Demo

Integrations expose provider-specific actions.

#### Production

Introduce a capability layer.

Instead of:

```text
gmail.reply_email
calendar.create_event
```

the agent reasons about:

```text
send_message
find_availability
create_event
order_food
```

Providers implement those capabilities.

For example:

```text
send_message
   │
   ├── Gmail
   ├── Outlook
   └── Slack
```

This reduces provider-specific reasoning inside the agent.

---

### Inbox Ranking

#### Demo

Display Inbox items in reverse chronological order.

#### Production

Rank items by expected user value.

Signals may include:

```text
importance
urgency
confidence
sender importance
time sensitivity
required action
memory
past feedback
```

The stored proactive scores become useful ranking features.

A meeting in ten minutes should outrank a low-priority email from yesterday.

---

### Reliability

Production would require explicit handling for:

- webhook retries
- expired subscriptions
- authentication expiration
- duplicate events
- failed actions
- partial synchronization
- stale data
- provider rate limits
- out-of-order events

Every external action should be traceable and retry-safe.

---

### Observability

Each Inbox item should be explainable.

```text
Inbox Item
    │
    ├── triggering event
    ├── retrieved memories
    ├── retrieved external context
    ├── importance
    ├── confidence
    ├── urgency
    ├── policy decision
    ├── proposed action
    └── user feedback
```

This makes incorrect proactive behavior debuggable.

---

## 32. Evaluation

A proactive agent should be evaluated on usefulness, not message volume.

### Precision

Of the items surfaced, how many were useful?

```text
accepted or meaningfully interacted with
────────────────────────────────────────
items surfaced
```

### Dismissal Rate

How often does the user reject or dismiss proactive suggestions?

### Notification Precision

Of the events important enough to interrupt the user about, how many were actually useful?

This should be held to a higher standard than Inbox precision.

### Action Acceptance Rate

How often does the user approve suggested actions?

### Edit Distance

How much does the user change an action before approving it?

Large edits indicate that the agent understood the intent but proposed the wrong execution.

### Memory Effectiveness

Does behavior improve after a preference is learned?

Example:

Before learning:

```text
Promotional email surfaced
Promotional email surfaced
Promotional email surfaced
```

After learning:

```text
Promotional emails ignored
```

### Score Calibration

Does an event scored at `0.80` importance actually produce positive feedback more often than an event scored at `0.60`?

This helps determine whether model-generated scores are meaningful.

### Missed-Event Recall

How often did something important happen that the agent failed to surface?

There is a tradeoff between recall and interruption.

The system should favor high precision.

---

## 33. What I Would Build With More Time

With substantially more development time, I would prioritize:

1. Replace Markdown memory as the source of truth with structured, evidence-backed memories.
2. Build relevance-based memory retrieval.
3. Add confidence scores and evidence counts to learned preferences.
4. Calibrate proactive importance scores from actual user feedback.
5. Personalize Inbox and notification thresholds.
6. Introduce a provider-independent capability layer.
7. Build a durable event pipeline with retries and deduplication.
8. Rank Inbox items by expected user value.
9. Add configurable autonomy based on action risk.
10. Improve cross-integration reasoning.
11. Build automated proactive-agent evaluation.
12. Add explainability for every surfaced item.
13. Add adaptive polling and stronger sync semantics.
14. Build memory invalidation so old preferences can weaken or disappear.
15. Add sender-, entity-, and context-specific memory.
16. Add user controls for inspecting and deleting learned memory.
17. Add cost-aware routing so simple events do not require expensive model calls.

---

## 34. Demo vs. Production

| Area | Demo | Production |
|---|---|---|
| Memory | `memory.md` | Structured memory service |
| Learning | Periodic distillation | Evidence + confidence model |
| Retrieval | Load memory files | Relevant memory retrieval |
| Polling | Fixed 30 seconds | Adaptive + push-first |
| Events | Simple queue | Durable event pipeline |
| Relevance | LLM scores + fixed thresholds | Calibrated personalized ranking |
| Notifications | Fixed urgency/importance policy | Personalized interruption policy |
| Agent | Single reasoning step | Filter → retrieve → reason → calibrate → validate |
| Integrations | Provider adapters | Capability abstraction |
| Inbox | Chronological | Ranked |
| Actions | Confirmation required | Risk-based autonomy |
| Evaluation | Manual testing | Continuous metrics and evals |
| Reliability | Basic retries | Idempotency, replay, backoff, audit |
| Memory UX | Hidden | Inspectable and user-editable |
