// Tests for `src/lib/updates.ts` (work unit U2). All cases are deterministic and
// do NOT depend on a real Tauri runtime — `invoke` and `fetch` are mocked.

import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";

import { PACKS_QUERY_KEY } from "@/content/loader";
import {
  shouldDownloadOverNetwork,
  checkOnlineContentUpdate,
  checkOnlineAppUpdate,
} from "@/lib/updates";

// ── Mocks ───────────────────────────────────────────────────────────────────
//
// `updates.ts` dynamically imports `@tauri-apps/api/core` inside each async
// function. `mock.module` registrations apply before those dynamic imports
// resolve, so a fake `invoke` here is what the functions call. We also stub the
// global `fetch`.

const invokeMock = mock(
  async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => {
    throw new Error(`invokeMock: unhandled command "${_cmd}"`);
  },
);

await mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const fetchMock = mock(
  async (_input: RequestInfo | URL): Promise<Response> => {
    throw new Error("fetchMock: not configured");
  },
);

// Replace the global `fetch` for the duration of the suite.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  invokeMock.mockReset();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

// A minimal fake QueryClient — only `invalidateQueries` is observed.
function makeFakeQueryClient(): {
  invalidateQueries: ReturnType<typeof mock>;
} {
  return { invalidateQueries: mock(() => Promise.resolve()) };
}

// ── shouldDownloadOverNetwork ──────────────────────────────────────────────

describe("shouldDownloadOverNetwork", () => {
  it("returns download=false when wifiOnly is true, with a reason mentioning Wi-Fi-only and undetectable", () => {
    const r = shouldDownloadOverNetwork(true);
    expect(r.download).toBe(false);
    expect(r.reason.includes("Wi-Fi-only")).toBe(true);
    expect(r.reason.includes("undetectable")).toBe(true);
  });

  it("returns download=true with empty reason when wifiOnly is false", () => {
    const r = shouldDownloadOverNetwork(false);
    expect(r.download).toBe(true);
    expect(r.reason).toBe("");
  });
});

// ── checkOnlineContentUpdate ───────────────────────────────────────────────

describe("checkOnlineContentUpdate", () => {
  it("returns [] and makes no fetch / no invoke when disabled", async () => {
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: false,
      wifiOnly: false,
    });
    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });

  it("resolves (never throws) with a 'fail' event whose detail mentions fetch failed / no network when fetch throws", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: true,
      wifiOnly: false,
    });
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e.outcome).toBe("fail");
    expect(e.channel).toBe("content-online");
    expect(e.detail.includes("fetch failed") || e.detail.includes("no network")).toBe(
      true,
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("on a successful apply, invalidates PACKS_QUERY_KEY and returns the apply events", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockImplementation(async () =>
      new Response(fakeBytes, { status: 200 }),
    );
    const applyEvents = [
      {
        channel: "content-online" as const,
        kind: "apply" as const,
        outcome: "ok" as const,
        detail: "applied 2 packs",
      },
    ];
    invokeMock.mockImplementation(async (cmd: string, _args?: Record<string, unknown>) => {
      if (cmd === "apply_online_content_bundle") {
        return { applied: ["phy-s2-motion"], skipped: [], events: applyEvents };
      }
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: true,
      wifiOnly: false,
    });
    expect(events).toEqual(applyEvents);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(qc.invalidateQueries.mock.calls[0][0]).toEqual({
      queryKey: PACKS_QUERY_KEY,
    });
  });

  it("with wifiOnly=true emits a single 'skipped' event and does not fetch or invoke", async () => {
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: true,
      wifiOnly: true,
    });
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe("skipped");
    expect(events[0].channel).toBe("content-online");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

// ── checkOnlineAppUpdate ───────────────────────────────────────────────────

describe("checkOnlineAppUpdate", () => {
  it("returns [] when disabled", async () => {
    const events = await checkOnlineAppUpdate({ enabled: false, wifiOnly: false });
    expect(events).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("when staged=true, returns events including a 'staged; will install on next launch' detail and never invokes relaunch", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "check_and_stage_app_update") {
        return {
          staged: true,
          currentVersion: "0.1.0",
          targetVersion: "0.2.0",
          events: [],
        };
      }
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    const events = await checkOnlineAppUpdate({
      enabled: true,
      wifiOnly: false,
    });
    const detail = events.map((e) => e.detail).join("|");
    expect(detail).toContain("staged; will install on next launch");
    // NEVER relaunch — doc 07 "defer relaunch to app idle or next launch".
    const cmds = invokeMock.mock.calls.map((c) => c[0]);
    expect(cmds).not.toContain("relaunch");
    expect(cmds.some((c) => String(c).toLowerCase().includes("relaunch"))).toBe(false);
  });

  it("with wifiOnly=true emits a single 'skipped' event and does not invoke check_and_stage_app_update", async () => {
    const events = await checkOnlineAppUpdate({
      enabled: true,
      wifiOnly: true,
    });
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe("skipped");
    const cmds = invokeMock.mock.calls.map((c) => c[0]);
    expect(cmds).not.toContain("check_and_stage_app_update");
  });

  it("resolves (never throws) with a 'fail' event when invoke rejects", async () => {
    invokeMock.mockImplementation(async () => {
      throw new Error("no network");
    });
    const events = await checkOnlineAppUpdate({
      enabled: true,
      wifiOnly: false,
    });
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe("fail");
    expect(events[0].detail.includes("check failed") || events[0].detail.includes("no network")).toBe(
      true,
    );
  });
});
