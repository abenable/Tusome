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

  it("downloads in Rust, never with a webview fetch (CORS)", async () => {
    invokeMock.mockImplementation(async () => ({ applied: [], skipped: [], events: [] }));
    await checkOnlineContentUpdate({
      queryClient: makeFakeQueryClient() as never,
      enabled: true,
      wifiOnly: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls[0][0]).toBe("download_and_apply_online_content");
  });

  it("resolves (never throws) with a 'fail' event when the Rust download rejects", async () => {
    invokeMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: true,
      wifiOnly: false,
    });
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe("fail");
    expect(events[0].channel).toBe("content-online");
    expect(events[0].detail).toContain("network down");
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });

  it("on a successful apply, invalidates PACKS_QUERY_KEY and adds an apply event", async () => {
    // The real Rust shape: per-step events, no overall success event.
    const rustEvents = [
      {
        channel: "content-online" as const,
        kind: "sig-verify" as const,
        outcome: "ok" as const,
        detail: "manifest signature valid",
      },
    ];
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "download_and_apply_online_content") {
        return { applied: ["phy-s2-motion"], skipped: [], events: rustEvents };
      }
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: true,
      wifiOnly: false,
    });
    expect(events).toEqual([
      ...rustEvents,
      {
        channel: "content-online",
        kind: "apply",
        outcome: "ok",
        detail: "applied 1 pack(s): phy-s2-motion",
      },
    ]);
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(qc.invalidateQueries.mock.calls[0][0]).toEqual({
      queryKey: PACKS_QUERY_KEY,
    });
  });

  it("when nothing was applied, returns Rust's events and doesn't reload packs", async () => {
    const skipped = [
      { channel: "content-online", kind: "copy", outcome: "skipped", detail: "up to date" },
    ];
    invokeMock.mockImplementation(async () => ({ applied: [], skipped: ["a"], events: skipped }));
    const qc = makeFakeQueryClient();
    const events = await checkOnlineContentUpdate({
      queryClient: qc as never,
      enabled: true,
      wifiOnly: false,
    });
    expect(events).toEqual(skipped as never);
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
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

  it("when staged=true, returns the download event and never installs or relaunches", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "check_and_stage_app_update") {
        // Shape check_and_stage_app_update really returns (updates.rs).
        return {
          staged: true,
          currentVersion: "0.1.0",
          targetVersion: "0.2.0",
          events: [
            {
              channel: "app",
              kind: "stage",
              outcome: "ok",
              detail: "downloaded 0.2.0; waiting for Restart and install",
            },
          ],
        };
      }
      throw new Error(`unexpected invoke: ${cmd}`);
    });
    const events = await checkOnlineAppUpdate({
      enabled: true,
      wifiOnly: false,
    });
    const detail = events.map((e) => e.detail).join("|");
    expect(detail).toContain("waiting for Restart and install");
    // NEVER install or relaunch from a check — on Windows installing quits the
    // app mid-lesson. That's an explicit teacher action only.
    const cmds = invokeMock.mock.calls.map((c) => c[0]);
    expect(cmds).toEqual(["check_and_stage_app_update"]);
    expect(cmds).not.toContain("install_staged_app_update");
    expect(cmds.some((c) => String(c).toLowerCase().includes("relaunch"))).toBe(false);
  });

  it("when Rust reports a failed check (staged=false), adds no contradicting 'ok' event", async () => {
    const failEvent = {
      channel: "app",
      kind: "check",
      outcome: "fail",
      detail: "check: error sending request",
    };
    invokeMock.mockImplementation(async () => ({
      staged: false,
      currentVersion: "0.1.0",
      targetVersion: null,
      events: [failEvent],
    }));
    const events = await checkOnlineAppUpdate({ enabled: true, wifiOnly: false });
    expect(events).toEqual([failEvent] as never);
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
