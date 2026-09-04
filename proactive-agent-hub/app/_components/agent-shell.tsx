"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight, Bell, Brain, CalendarDays, Check, ChevronDown, ChevronUp,
  Clock3, ExternalLink, Inbox, Link2, LoaderCircle, Mail, MessageCircle,
  PanelLeft, Search, Send, Settings, ShieldCheck, ShoppingBag, Sparkles, Trash2, X, Zap,
} from "lucide-react";

type Page = "inbox" | "chat" | "connections" | "memory";
type Workspace = "demo" | "personal";
type Runtime = { available: boolean; version?: string; mode?: string };
const GOOGLE_POLL_LOCK_KEY = "persona-google-poll-lock";
const GOOGLE_POLL_LOCK_TTL_MS = 55_000;
const sourceMeta = {
  gmail: { label: "Gmail", icon: Mail, className: "source-gmail" },
  calendar: { label: "Calendar", icon: CalendarDays, className: "source-calendar" },
  doordash: { label: "DoorDash · demo", icon: ShoppingBag, className: "source-doordash" },
} as const;

function SourceIcon({ source, size = "md" }: { source: string; size?: "sm" | "md" | "lg" }) {
  const meta = sourceMeta[source as keyof typeof sourceMeta] ?? sourceMeta.gmail;
  const Icon = meta.icon;
  return <div className={`source-icon ${meta.className} source-icon-${size}`}><Icon /></div>;
}

function SourceLabel({ source }: { source: string }) {
  const meta = sourceMeta[source as keyof typeof sourceMeta] ?? sourceMeta.gmail;
  return <span className="source-label"><SourceIcon source={source} size="sm" />{meta.label}</span>;
}

function timeAgo(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function scoreLabel(score: number) {
  if (score >= 0.8) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

function cleanPreview(content: string) {
  return content
    .replace(/[\u034f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value.getTime();
}

export function AgentShell() {
  const [page, setPage] = useState<Page>("inbox");
  const [workspace, setWorkspace] = useState<Workspace>("demo");
  const [runtime, setRuntime] = useState<Runtime>({ available: false });
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const summary = useQuery(api.inbox.summary, { workspace, since: startOfToday() });
  const personalConnections = useQuery(api.connections.list, { workspace: "personal" });
  const connectedGoogleKeys = useMemo(() => personalConnections?.filter((connection) => connection.status === "connected" && (connection.key === "gmail" || connection.key === "calendar")).map((connection) => connection.key).sort().join(",") ?? "", [personalConnections]);
  const polling = useRef(false);
  useEffect(() => {
    fetch("/api/agent/health").then(async (response) => await response.json()).then(setRuntime).catch(() => setRuntime({ available: false }));
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("view") === "connections") setPage("connections");
      const savedWorkspace = window.localStorage.getItem("persona-workspace");
      if (savedWorkspace === "personal" || savedWorkspace === "demo") setWorkspace(savedWorkspace);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const connected = connectedGoogleKeys ? connectedGoogleKeys.split(",") : [];
    if (connected.length === 0) return;
    async function poll() {
      if (polling.current) return;
      const now = Date.now();
      const previousClaim = window.localStorage.getItem(GOOGLE_POLL_LOCK_KEY);
      const previousTimestamp = Number(previousClaim?.split(":", 1)[0] ?? 0);
      if (now - previousTimestamp < GOOGLE_POLL_LOCK_TTL_MS) return;

      const claim = `${now}:${window.crypto.randomUUID()}`;
      window.localStorage.setItem(GOOGLE_POLL_LOCK_KEY, claim);
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (window.localStorage.getItem(GOOGLE_POLL_LOCK_KEY) !== claim) return;

      polling.current = true;
      try {
        for (const key of connected) await fetch(`/api/integrations/${key}/sync`, { method: "POST" });
      } finally {
        window.localStorage.setItem(GOOGLE_POLL_LOCK_KEY, `${Date.now()}:complete`);
        polling.current = false;
      }
    }
    const first = window.setTimeout(() => void poll(), 5_000);
    const interval = window.setInterval(() => void poll(), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [connectedGoogleKeys]);
  function chooseWorkspace(next: Workspace) {
    setWorkspace(next);
    window.localStorage.setItem("persona-workspace", next);
    setAccountOpen(false);
    setPage("inbox");
  }
  return <div className="app-shell">
    <Sidebar page={page} setPage={(next) => { setPage(next); setNavOpen(false); }} runtime={runtime} open={navOpen} inboxCount={summary?.open ?? 0} workspace={workspace} />
    <div className="workspace">
      <header className="topbar"><button className="mobile-menu" onClick={() => setNavOpen((value) => !value)} aria-label="Toggle navigation"><PanelLeft /></button><div className="topbar-title">{page === "inbox" ? "Today" : page[0].toUpperCase() + page.slice(1)}<span className="workspace-pill">{workspace === "demo" ? "Demo" : "Personal"}</span></div><div className="topbar-actions"><button className="icon-button" aria-label="Search"><Search /></button><button className="icon-button notification-button" aria-label="Notifications"><Bell /><span /></button><div className="account-switcher"><button className="account-button" aria-label="Switch workspace" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><span className="avatar">{workspace === "demo" ? "D" : "JA"}</span><ChevronDown /></button>{accountOpen && <div className="account-menu"><small>Switch workspace</small><button className={workspace === "demo" ? "active" : ""} onClick={() => chooseWorkspace("demo")}><span className="avatar small">D</span><span><strong>Demo</strong><small>Populated sample data</small></span>{workspace === "demo" && <Check />}</button><button className={workspace === "personal" ? "active" : ""} onClick={() => chooseWorkspace("personal")}><span className="avatar small">JA</span><span><strong>Justin</strong><small>Live Google data</small></span>{workspace === "personal" && <Check />}</button></div>}</div></div></header>
      <main className="main-canvas">{page === "inbox" && <InboxPage key={workspace} workspace={workspace} />}{page === "chat" && <ChatPage key={workspace} runtime={runtime} workspace={workspace} />}{page === "connections" && <ConnectionsPage key={workspace} workspace={workspace} />}{page === "memory" && <MemoryPage key={workspace} workspace={workspace} />}</main>
    </div>
  </div>;
}

function Sidebar({ page, setPage, runtime, open, inboxCount, workspace }: { page: Page; setPage: (page: Page) => void; runtime: Runtime; open: boolean; inboxCount: number; workspace: Workspace }) {
  const items = [{ id: "inbox" as const, label: "Inbox", icon: Inbox }, { id: "chat" as const, label: "Chat", icon: MessageCircle }, { id: "connections" as const, label: "Connections", icon: Link2 }, { id: "memory" as const, label: "Memory", icon: Brain }];
  return <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
    <div className="brand"><div className="brand-mark"><span /></div><span>Persona</span></div>
    <nav className="primary-nav"><div className="nav-label">{workspace === "demo" ? "Demo workspace" : "Personal workspace"}</div>{items.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => setPage(item.id)}><Icon /><span>{item.label}</span>{item.id === "inbox" && inboxCount > 0 && <b>{inboxCount}</b>}</button>; })}</nav>
    <div className="sidebar-spacer" />
    <div className="precision-card"><div className="precision-title"><ShieldCheck /> Precision mode</div><p>{workspace === "demo" ? "Sample signals demonstrate the relevance policy." : "Live signals below your threshold stay quiet."}</p><div className="precision-track"><span style={{ width: workspace === "demo" ? "84%" : "68%" }} /></div><small>{workspace === "demo" ? "Demo behavior" : "Learning from your feedback"}</small></div>
    <button className="nav-item"><Settings /><span>Settings</span></button>
    <div className="runtime-row"><span className={runtime.available ? "status-dot online" : "status-dot"} /><div><strong>{runtime.available ? "Local agent ready" : "Checking local agent"}</strong><small>{runtime.version ?? "Codex CLI"}</small></div></div>
  </aside>;
}

function InboxPage({ workspace }: { workspace: Workspace }) {
  const todayStart = startOfToday();
  const items = useQuery(api.inbox.list, { workspace, limit: 30 });
  const summary = useQuery(api.inbox.summary, { workspace, since: todayStart });
  const filteredDecisions = useQuery(api.inbox.listFiltered, { workspace, since: todayStart, limit: 100 });
  const connections = useQuery(api.connections.list, { workspace });
  const respond = useMutation(api.inbox.respond);
  const markRead = useMutation(api.inbox.markRead);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [showFiltered, setShowFiltered] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const activeItems = useMemo(() => items?.filter((item) => item.status === "unread" || item.status === "read") ?? [], [items]);
  const visibleItems = filter === "active" ? activeItems : items ?? [];
  async function handleResponse(itemId: Id<"inboxItems">, response: "approved" | "rejected" | "dismissed", editedSummary?: string) {
    setBusy(itemId);
    try {
      const result = await respond({ itemId, response, editedSummary });
      let message = result.message;
      if (result.requiresExecution && result.executionIntegration) {
        const execution = await fetch(`/api/integrations/${result.executionIntegration}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
        const executionResult = await execution.json();
        message = execution.ok ? executionResult.message : executionResult.error;
      }
      setToast(message);
      setEditing(null);
      setTimeout(() => setToast(null), 4500);
    } finally { setBusy(null); }
  }
  async function runAgent() {
    setScanBusy(true);
    try {
      if (workspace === "demo") {
        const response = await fetch("/api/agent/evaluate", { method: "POST" });
        const result = await response.json();
        setToast(response.ok ? (result.message ?? (result.surfaced ? "A new demo signal was evaluated and surfaced." : "A demo signal was evaluated and quietly filtered.")) : (result.error ?? "Evaluation failed."));
      } else {
        const providers = connections?.filter((connection) => connection.status === "connected" && (connection.key === "gmail" || connection.key === "calendar")) ?? [];
        if (providers.length === 0) {
          setToast("Connect Gmail or Calendar to run a personal agent check.");
        } else {
          let evaluated = 0; let surfaced = 0; let duplicates = 0;
          for (const provider of providers) {
            const response = await fetch(`/api/integrations/${provider.key}/sync`, { method: "POST" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? `${provider.name} sync failed.`);
            evaluated += result.evaluated ?? 0; surfaced += result.surfaced ?? 0; duplicates += result.duplicates ?? 0;
          }
          setToast(`Agent check complete: ${evaluated} new, ${surfaced} surfaced, ${duplicates} already seen.`);
        }
      }
      setTimeout(() => setToast(null), 4500);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Agent check failed.");
    } finally { setScanBusy(false); }
  }
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const greeting = new Date().getHours() < 12 ? "Good morning." : new Date().getHours() < 18 ? "Good afternoon." : "Good evening.";
  const metrics = summary ?? { open: 0, timeSensitive: 0, filteredToday: 0 };
  return <div className="page-wrap inbox-page">
    {toast && <div className="toast"><Check />{toast}</div>}
    <section className="page-hero"><div><div className="eyebrow"><span className="live-pulse" /> {today}</div><h1>{greeting}</h1><p>{metrics.open === 0 ? "Nothing needs your attention right now." : `I found ${metrics.open} ${metrics.open === 1 ? "thing" : "things"} worth your attention. Everything else stayed quiet.`}</p></div><div className="run-agent-wrap"><Button className="run-agent-button" onClick={runAgent} disabled={scanBusy} title={workspace === "demo" ? "Generate and evaluate a sample signal" : "Immediately sync and evaluate connected Google sources"}>{scanBusy ? <LoaderCircle className="spin" /> : <Sparkles />}Run agent check</Button><small>{workspace === "demo" ? "Creates and scores one new sample signal." : "Syncs Google now, scores unseen items, and applies your policy."}</small></div></section>
    <section className="summary-strip"><div><span className="summary-icon warm"><Zap /></span><strong>{metrics.open}</strong><p>Worth a look</p></div><div><span className="summary-icon blue"><Bell /></span><strong>{metrics.timeSensitive}</strong><p>Time-sensitive</p></div><div><span className="summary-icon green"><ShieldCheck /></span><strong>{metrics.filteredToday}</strong><p>Filtered today</p></div><div className="summary-copy"><Sparkles /><p><strong>Live workspace totals.</strong><br />These counts update from actual decisions and inbox state.</p></div></section>
    <div className="section-heading"><div><h2>Your inbox</h2><span>{metrics.open} open {metrics.open === 1 ? "item" : "items"}</span></div><div className="segmented"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Open</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button></div></div>
    <div className="inbox-list">{items === undefined ? Array.from({ length: 3 }).map((_, index) => <div className="inbox-card skeleton" key={index} />) : visibleItems.length === 0 ? <EmptyInbox /> : visibleItems.map((item) => {
      const isExpanded = expanded === item._id; const isEditing = editing === item._id; const isDone = item.status === "completed" || item.status === "dismissed";
      return <article className={`inbox-card ${item.policy === "notify" ? "urgent" : ""} ${isDone ? "resolved" : ""}`} key={item._id} onMouseEnter={() => void markRead({ itemId: item._id })}><div className="card-accent" /><div className="inbox-card-body">
        <div className="card-meta"><SourceLabel source={item.integrationId} /><span>·</span><span>{timeAgo(item.createdAt)}</span>{item.policy === "notify" && <span className="urgent-badge"><Zap /> Time-sensitive</span>}{isDone && <span className="done-badge"><Check /> {item.status}</span>}</div>
        <p className="card-message">{item.message}</p>
        {item.action && !isDone && <div className="action-preview"><div><small>Proposed action</small>{isEditing ? <Input value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus /> : <p>{item.action.editedSummary ?? item.action.summary}</p>}</div><ShieldCheck /></div>}
        <div className="card-footer"><div className="action-buttons">{item.action && !isDone ? <>{isEditing ? <Button onClick={() => void handleResponse(item._id, "approved", draft)} disabled={busy === item._id}><Check />Approve edit</Button> : <Button onClick={() => void handleResponse(item._id, "approved")} disabled={busy === item._id}>{busy === item._id ? <LoaderCircle className="spin" /> : <Check />}{item.integrationId === "doordash" ? "Place mock order" : item.integrationId === "calendar" ? "Create event" : "Approve"}</Button>}{item.integrationId !== "calendar" && <Button variant="outline" onClick={() => { setEditing(isEditing ? null : item._id); setDraft(item.action?.summary ?? ""); }}>{isEditing && <X />}{isEditing ? "Cancel" : "Edit"}</Button>}<Button variant="ghost" onClick={() => void handleResponse(item._id, "rejected")}>No thanks</Button></> : !isDone ? <Button variant="outline" onClick={() => void handleResponse(item._id, "dismissed")}>Dismiss</Button> : null}</div><button className="why-button" onClick={() => setExpanded(isExpanded ? null : item._id)}>{isExpanded ? "Hide reasoning" : "Why this?"}{isExpanded ? <ChevronUp /> : <ChevronDown />}</button></div>
        {isExpanded && <div className="reasoning-panel"><div className="reasoning-copy"><Sparkles /><p><strong>Why Persona surfaced this</strong><br />{item.reason}</p></div><div className="scores"><Score name="Importance" value={item.importance} /><Score name="Confidence" value={item.confidence} /><Score name="Urgency" value={item.urgency} /></div><small>Policy: importance ≥ 0.50 → inbox · high urgency + confidence → notification</small></div>}
      </div></article>;
    })}</div>
    <div className="quiet-note"><ShieldCheck /><div><strong>{metrics.filteredToday} {metrics.filteredToday === 1 ? "signal" : "signals"} filtered today</strong><p>Low-value items were scored below your threshold and kept out of the inbox.</p></div><button aria-expanded={showFiltered} onClick={() => setShowFiltered((value) => !value)}>{showFiltered ? "Hide filtered" : "Decision policy"}{showFiltered ? <ChevronUp /> : <ArrowRight />}</button></div>
    {showFiltered && <section className="filtered-history"><div className="filtered-history-heading"><div><h2>Filtered today</h2><p>These signals were evaluated and intentionally kept quiet.</p></div><span>Importance below 50%</span></div>{filteredDecisions === undefined ? <div className="filtered-loading">Loading decisions…</div> : filteredDecisions.length === 0 ? <div className="filtered-empty">No filtered signals in this workspace today.</div> : <div className="filtered-list">{filteredDecisions.map((decision) => <article className="filtered-card" key={decision._id}><div className="filtered-card-head"><SourceLabel source={decision.integrationId} /><span>{timeAgo(decision.createdAt)}</span><span className="filtered-badge"><ShieldCheck /> Filtered</span></div><h3>{decision.title}</h3><p>{cleanPreview(decision.content)}</p><div className="filtered-reason"><strong>Why it stayed quiet</strong><span>{decision.reason}</span></div><div className="scores"><Score name="Importance" value={decision.importance} /><Score name="Confidence" value={decision.confidence} /><Score name="Urgency" value={decision.urgency} /></div></article>)}</div>}</section>}
  </div>;
}

function Score({ name, value }: { name: string; value: number }) { return <div className="score"><div><span>{name}</span><b>{scoreLabel(value)} · {Math.round(value * 100)}</b></div><div className="score-track"><span style={{ width: `${value * 100}%` }} /></div></div>; }
function EmptyInbox() { return <div className="empty-state"><div><Check /></div><h3>You’re all caught up</h3><p>Persona is still watching. Quiet is a feature.</p></div>; }

function ChatPage({ runtime, workspace }: { runtime: Runtime; workspace: Workspace }) {
  const messages = useQuery(api.chat.listMessages, { workspace, limit: 60 });
  const clearConversation = useMutation(api.chat.clearConversation);
  const [input, setInput] = useState(""); const [sending, setSending] = useState(false); const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  async function send(event?: FormEvent) { event?.preventDefault(); const message = input.trim(); if (!message || sending) return; setInput(""); setSending(true); try { await fetch("/api/agent/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, workspace }) }); } finally { setSending(false); } }
  async function newChat() {
    if (messages && messages.length > 0 && !window.confirm(`Clear the ${workspace} chat and start over?`)) return;
    await clearConversation({ workspace });
    setInput("");
  }
  const prompts = ["What does tomorrow look like?", "Draft the reply to Sarah", "Stop showing promotional email"];
  return <div className="page-wrap chat-page"><section className="page-hero compact"><div><div className="eyebrow"><span className={runtime.available ? "live-pulse" : "live-pulse offline"} /> {runtime.available ? "Local Codex is ready" : "Local runtime unavailable"}</div><h1>Chat with Persona</h1><p>{workspace === "demo" ? "A sample conversation with demo memory and context." : "Your private conversation with live context and personal memory."}</p></div><Button variant="outline" onClick={() => void newChat()}><Trash2 />New chat</Button></section><div className="chat-surface">
    <div className="chat-context"><div className="brand-mark small"><span /></div><div><strong>Persona · {workspace === "demo" ? "Demo" : "Personal"}</strong><small>Powered locally by your Codex subscription</small></div><span className="private-pill"><ShieldCheck /> Local runtime</span></div>
    <div className="messages">{messages?.length === 0 && <div className="chat-empty"><Sparkles /><strong>Start a new conversation</strong><p>{workspace === "personal" ? "This workspace begins with a clean chat." : "Ask Persona to work with the sample context."}</p></div>}{messages?.map((message) => <div key={message._id} className={`message-row ${message.role}`}>{message.role === "assistant" && <div className="assistant-avatar"><Sparkles /></div>}<div className="message-bubble">{message.toolLabel && <small><Check />{message.toolLabel}</small>}<p>{message.content}</p></div></div>)}{sending && <div className="message-row assistant"><div className="assistant-avatar"><Sparkles /></div><div className="message-bubble thinking"><span /><span /><span /><p>Thinking with your current context…</p></div></div>}<div ref={bottomRef} /></div>
    <div className="suggested-prompts">{prompts.map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>)}</div>
    <form className="composer" onSubmit={send}><Input aria-label="Message Persona" placeholder="Ask Persona to check, plan, or draft…" value={input} onChange={(event) => setInput(event.target.value)} disabled={sending} /><Button type="submit" size="icon" disabled={!input.trim() || sending} aria-label="Send message"><Send /></Button><small><ShieldCheck /> External writes always require confirmation</small></form>
  </div></div>;
}

function ConnectionsPage({ workspace }: { workspace: Workspace }) {
  const connections = useQuery(api.connections.list, { workspace });
  const [googleBusy, setGoogleBusy] = useState<"gmail-sync" | "calendar-sync" | "disconnect" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const google = params.get("google");
      if (workspace === "personal" && google === "connected") setNotice("Google connected. Gmail and Calendar are ready for automatic sync.");
      if (google === "denied") setNotice("Google connection was cancelled.");
      if (google === "error") setNotice(params.get("message") ?? "Google connection failed.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspace]);
  async function syncGoogle(key: "gmail" | "calendar") {
    setGoogleBusy(`${key}-sync`);
    try {
      const response = await fetch(`/api/integrations/${key}/sync`, { method: "POST" });
      const result = await response.json();
      const prefix = key === "gmail" ? "Gmail" : "Calendar";
      setNotice(response.ok ? `${prefix} sync complete: ${result.evaluated} new, ${result.surfaced} surfaced, ${result.duplicates} already seen.` : result.error);
    } finally { setGoogleBusy(null); }
  }
  async function disconnectGoogle() {
    if (!window.confirm("Disconnect Gmail and Calendar and revoke Persona’s Google access?")) return;
    setGoogleBusy("disconnect");
    try {
      const response = await fetch("/api/integrations/gmail/disconnect", { method: "POST" });
      const result = await response.json();
      setNotice(response.ok ? "Google disconnected. Gmail and Calendar tokens were removed locally." : result.error);
    } finally { setGoogleBusy(null); }
  }
  return <div className="page-wrap"><section className="page-hero compact"><div><div className="eyebrow">{workspace === "demo" ? "Sample provider environment" : "Your context, under your control"}</div><h1>Connections</h1><p>{workspace === "demo" ? "Demo connections never touch external accounts." : "Connected Google sources poll automatically while Persona is open. Every external write remains confirmation-gated."}</p></div><Button variant="outline"><Link2 />Add connection</Button></section>{notice && <div className="connection-notice"><Check />{notice}</div>}<div className="connection-summary"><ShieldCheck /><p><strong>Permission boundary</strong><br />The model proposes actions. Application code validates capabilities and waits for you to approve.</p></div>
    <div className="connections-grid">{connections === undefined ? Array.from({ length: 3 }).map((_, i) => <div className="connection-card skeleton" key={i} />) : connections.map((connection) => {
      const isGoogleIntegration = (connection.key === "gmail" || connection.key === "calendar") && connection.connectionKind === "oauth";
      const syncKey = connection.key === "calendar" ? "calendar" as const : "gmail" as const;
      const syncBusy = googleBusy === `${syncKey}-sync`;
      return <article className="connection-card" key={connection._id}><div className="connection-head"><SourceIcon source={connection.key} size="lg" /><div><h2>{connection.name}</h2><span className={`connection-status ${connection.status}`}><i />{connection.status === "demo" ? "Demo integration" : connection.status}</span></div><button className="more-button">•••</button></div>{connection.accountEmail && <div className="account-email">{connection.accountEmail}</div>}<p className="connection-description">{connection.description}</p><div className="sync-row"><div><Clock3 /><span>Last synced</span></div><strong>{connection.status === "disconnected" ? "Paused" : timeAgo(connection.lastSyncAt)}</strong></div><div className="sync-row"><div><Zap /><span>Sync method</span></div><strong>{isGoogleIntegration ? "Automatic local polling · 60 sec" : connection.connectionKind === "demo" ? "Simulated" : connection.syncMode === "webhook" ? "Webhook" : "Polling"}</strong></div><div className="capabilities"><small>Capabilities</small><div>{connection.capabilities.map((capability) => <span key={capability}>{capability.replaceAll("_", " ")}</span>)}</div></div><div className="connection-footer"><button><ExternalLink />View permissions</button>{isGoogleIntegration ? connection.status === "disconnected" ? <Button asChild><a href="/api/oauth/google/start">Connect {connection.key === "calendar" ? "Calendar" : "Gmail"}</a></Button> : <div className="gmail-actions"><Button variant="outline" onClick={() => void syncGoogle(syncKey)} disabled={googleBusy !== null}>{syncBusy && <LoaderCircle className="spin" />}Sync now</Button><Button variant="outline" onClick={() => void disconnectGoogle()} disabled={googleBusy !== null}>Disconnect Google</Button></div> : <span className="demo-only-label">Sample data only</span>}</div></article>;
    })}</div>
    <section className="adapter-note"><div><Sparkles /></div><div><h3>Integration adapters, not special cases</h3><p>Each provider normalizes events and declares capabilities. The agent pipeline stays unchanged when a new service is added.</p></div><code>event → context → scores → policy</code></section>
  </div>;
}

function MemoryPage({ workspace }: { workspace: Workspace }) {
  const memories = useQuery(api.memories.list, { workspace });
  const removeMemory = useMutation(api.memories.remove);
  const [managing, setManaging] = useState(false);
  const global = memories?.filter((memory) => memory.scope === "global") ?? [];
  const scoped = memories?.filter((memory) => memory.scope === "integration") ?? [];
  async function forget(id: Id<"memories">) {
    if (!window.confirm("Forget this memory in the current workspace?")) return;
    await removeMemory({ workspace, id });
  }
  return <div className="page-wrap"><section className="page-hero compact"><div><div className="eyebrow">Transparent personalization · {workspace === "demo" ? "Demo" : "Personal"}</div><h1>What Persona remembers</h1><p>{workspace === "demo" ? "Sample preferences explain how the populated demo is ranked." : "Only preferences learned in your personal workspace appear here."}</p></div><Button variant="outline" onClick={() => setManaging((value) => !value)}><Settings />{managing ? "Done" : "Manage memory"}</Button></section><div className="memory-callout"><Brain /><div><strong>Memory changes relevance</strong><p>The same event can score differently after repeated approvals, dismissals, or a direct instruction from you.</p></div></div>{memories?.length === 0 ? <div className="empty-state memory-empty"><div><Brain /></div><h3>No personal memories yet</h3><p>Tell Persona a durable preference in Chat and it will appear here.</p></div> : <><section className="memory-section"><div className="section-heading"><div><h2>Global preferences</h2><span>Used across every connection</span></div></div><div className="memory-grid">{global.map((memory) => <MemoryCard key={memory._id} memory={memory} managing={managing} onForget={() => void forget(memory._id)} />)}</div></section><section className="memory-section"><div className="section-heading"><div><h2>Connection-specific</h2><span>Loaded only when relevant</span></div></div><div className="memory-grid">{scoped.map((memory) => <MemoryCard key={memory._id} memory={memory} managing={managing} onForget={() => void forget(memory._id)} />)}</div></section></>}</div>;
}

function MemoryCard({ memory, managing, onForget }: { memory: { content: string; confidence: number; evidenceCount: number; sourceLabel: string; integrationId?: string }; managing: boolean; onForget: () => void }) {
  return <article className="memory-card"><div className="memory-card-head">{memory.integrationId ? <SourceLabel source={memory.integrationId} /> : <span className="source-label"><Brain />Global</span>}<span>{Math.round(memory.confidence * 100)}% confidence</span></div><p>{memory.content}</p><div className="memory-evidence"><div className="score-track"><span style={{ width: `${memory.confidence * 100}%` }} /></div><small>{memory.sourceLabel} · {memory.evidenceCount} evidence signals</small></div>{managing && <Button variant="outline" className="forget-memory" onClick={onForget}><Trash2 />Forget</Button>}</article>;
}
