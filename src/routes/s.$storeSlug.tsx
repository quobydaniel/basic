import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/s/$storeSlug")({
  component: () => <Outlet />,
});
