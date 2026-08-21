import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";

import "./index.css";
import { routeTree } from "./routeTree.gen";

// Content packs are read from disk and are effectively immutable between
// explicit updates (USB / admin), so cache them indefinitely and invalidate
// by hand. See docs/plan/03-architecture.md §"State ownership".
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, refetchOnWindowFocus: false },
  },
});

const router = createRouter({ routeTree, context: { queryClient } });

// Type-safety bridge between the generated route tree and the router. The
// `context` we pass (queryClient) becomes the type of `context` in every route
// loader / `Route.useRouteContext()`.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
