/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentContext from "../agentContext.js";
import type * as chat from "../chat.js";
import type * as connections from "../connections.js";
import type * as demo from "../demo.js";
import type * as events from "../events.js";
import type * as inbox from "../inbox.js";
import type * as memories from "../memories.js";
import type * as oauth from "../oauth.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentContext: typeof agentContext;
  chat: typeof chat;
  connections: typeof connections;
  demo: typeof demo;
  events: typeof events;
  inbox: typeof inbox;
  memories: typeof memories;
  oauth: typeof oauth;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
