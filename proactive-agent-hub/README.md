# Persona

A local-first demo of the proactive personal agent described in the repository design doc.

## Run locally

```bash
pnpm dev
```

This starts the Next.js app and Convex development backend together. The app uses the Codex CLI already installed and authenticated on the machine; no model API key is required. The local bridge invokes `codex exec` with an ephemeral session, a read-only sandbox, structured output validation, and a two-minute timeout.

If Codex lives somewhere other than the ChatGPT desktop bundle or your `PATH`, set `CODEX_BIN`. Set `CODEX_MODEL` only if you want to override your normal configured model.

## Connect Google Workspace

Create a Google OAuth web client, enable both the Gmail API and Google Calendar API, and add this exact authorized redirect URI:

```text
http://localhost:3000/api/oauth/google/callback
```

Copy `.env.example` to `.env.local`, fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart `pnpm dev`. In Google Auth Platform, add `https://www.googleapis.com/auth/calendar.events` under **Data Access**. In Persona, open **Connections**, choose **Connect Gmail** or **Connect Calendar**, and complete Google's consent screen. One encrypted Google grant powers both connections.

Gmail **Sync now** reads a bounded set of recent inbox metadata and snippets and evaluates at most three unseen messages per run through the local Codex CLI. Persona never fetches full message bodies during sync. Calendar **Sync now** reads up to twelve events from the primary calendar over the next seven days and evaluates at most four unseen events. Chat can turn an unambiguous scheduling request into a proposed `create_event` action in the Inbox.

Persona automatically polls each connected Google source every 60 seconds while the app is open. A cross-tab lease prevents multiple Persona tabs from duplicating the same polling cycle. **Run agent check** performs that refresh immediately in the Personal workspace; in the Demo workspace it generates and evaluates a new sample signal so the full agent loop can be demonstrated without touching an external account.

Polling is intentional for the localhost demo. Gmail push delivery requires a Google Cloud Pub/Sub topic and a renewable mailbox watch, while Calendar push delivery requires a publicly reachable HTTPS webhook and a renewable notification channel. A hosted production version should use those push mechanisms for low-latency wakeups and retain periodic polling for reconciliation.

OAuth tokens are AES-256-GCM encrypted in `.data/google-oauth.enc.json`, which is gitignored. Email replies and Calendar event creation remain confirmation-gated and execute only after approval in the Inbox. **Disconnect Google** revokes the shared token and removes the local credential file.

## Demo boundaries

- The avatar menu switches between two local workspaces. **Demo** keeps populated sample inbox, chat, and memory data; **Personal** contains live Google data and begins with separate, empty chat and memory state. These are demo environments, not application user accounts.
- Inbox totals are calculated from persisted events and decisions for the selected workspace; no dashboard count is hardcoded.
- **New chat** clears only the selected workspace's conversation. **Manage memory** exposes individual memories that can be forgotten without changing the other workspace.
- Gmail supports real OAuth-backed reads and confirmation-gated replies. Google Calendar supports real upcoming-event reads and confirmation-gated event creation on the primary calendar.
- DoorDash is always mocked and never charges or places a real order.
- Read operations and relevance evaluation can run automatically.
- Every external write is represented as a proposed action and requires confirmation.
- Convex persists immutable events, decisions, inbox state, actions/results, conversation history, feedback, integration state, and distilled memory.

The local runtime lives in `lib/agent`, provider adapters live in `lib/integrations`, localhost route handlers live in `app/api/agent`, and durable functions/schema live in `convex`.

---

# Welcome to your Convex + Next.js app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) for building great looking accessible UI fast

## Get started

If you just cloned this codebase and didn't use `npm create convex`, run:

```
npm install
npm run dev
```

If you're reading this README on GitHub and want to use this template, run:

```
npm create convex@latest -- -t nextjs-shadcn
```

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.

## Join the community

Join thousands of developers building full-stack apps with Convex:

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

# Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/get-convex/), star and contribute to the open-source implementation of Convex.
