// /chat index — the conversation list is rendered by the /chat layout route
// (ChatList in the left pane). This index component exists only so the
// router has a match for the bare /chat URL; everything visible comes from
// the layout.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/")({
  component: () => null,
});
