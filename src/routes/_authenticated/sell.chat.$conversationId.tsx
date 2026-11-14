// Thread pane for the SELLER inbox — same ThreadPage component as the buyer
// thread; role-aware UI (auto-pilot, order creation) keys off
// conversation.seller_id === user.id.
import { createFileRoute } from "@tanstack/react-router";
import { ThreadPage } from "../chat.$conversationId";

export const Route = createFileRoute("/_authenticated/sell/chat/$conversationId")({
  component: () => {
    const { conversationId } = Route.useParams();
    // Key by conversation — see ThreadPageRoute in chat.$conversationId.tsx.
    return <ThreadPage key={conversationId} conversationId={conversationId} />;
  },
});
