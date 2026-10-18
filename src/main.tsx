import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";

import "./index.css";
import { routeTree } from "./routeTree.gen";
import { restoreTextSize } from "./components/SidebarTools";

// Content packs are read from disk and are effectively immutable between
// explicit updates (USB / admin), so cache them indefinitely and invalidate
// by hand. See docs/plan/03-architecture.md §"State ownership".
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, refetchOnWindowFocus: false },
  },
});

// One error screen for every route: a failed pack read or DB call shows this
// instead of TanStack's bare "Something went wrong!".
function RouteError({ error, reset }: ErrorComponentProps) {
  console.error("[router] route error:", error);
  return (
    <div role="alert" className="flex max-w-[560px] flex-col items-start gap-4 p-8">
      <h1 className="font-heading text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
        Something didn’t load
      </h1>
      <p className="font-sans text-[18px] leading-relaxed text-ink-2">
        Tusome couldn’t read part of its content. Try again, and if it keeps
        happening, ask your teacher to restart the app.
      </p>
      <button
        type="button"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
        className="inline-flex min-h-[48px] items-center rounded-full bg-brand px-6 font-sans text-[18px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  );
}

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultErrorComponent: RouteError,
});

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

void restoreTextSize();
