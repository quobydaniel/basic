// /chat layout — the BUYER inbox. Buyer-side conversations only (the hard
// scope lives in ChatList). The seller inbox lives at /sell/chat; both share
// the ChatShell split view.
import { createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/components/ChatShell";

export const Route = createFileRoute("/chat")({
  component: () => <ChatShell scope="buying" />,
});
