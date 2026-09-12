// /sell/chat layout — the SELLER inbox. Buyer conversations for the user's
// store only, plus the Pro AI seller assistant (describe products, track
// orders, draft replies). The buyer inbox lives at /chat.
import { createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/components/ChatShell";

export const Route = createFileRoute("/_authenticated/sell/chat")({
  component: () => <ChatShell scope="selling" />,
});
