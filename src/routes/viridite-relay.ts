import { createFileRoute } from "@tanstack/react-router";

/**
 * The published app was returning the page (404 / HTML-only) for this path.
 * Friends join by GET health + POST mailbox. A WebSocket is optional.
 */
export const Route = createFileRoute("/viridite-relay")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { relayHttp } = await import("../../server/relay-http.ts");
        return relayHttp(request);
      },
      POST: async ({ request }) => {
        const { relayHttp } = await import("../../server/relay-http.ts");
        return relayHttp(request);
      },
      HEAD: async ({ request }) => {
        const { relayHttp } = await import("../../server/relay-http.ts");
        return relayHttp(request);
      },
    },
  },
});
