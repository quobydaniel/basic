// Node 20 has no global WebSocket (Node 22+ ships one). Supabase-js 2.110's
// auth.getClaims() — used by every authenticated server function — opens a
// realtime socket, which throws without it. Import this module FIRST in any
// server-side module that touches supabase auth middleware; realtime-js then
// picks the global up at connect time.
import { WebSocket as NodeWebSocket } from "ws";

if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = NodeWebSocket;
}
