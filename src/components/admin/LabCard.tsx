// Computer lab setup — run this PC on its own, as the lab server, or as a
// client of a lab server (src-tauri/src/lab.rs) — and backing up the records.
// Changing mode restarts Tusome, which is the simplest way to start or stop
// the server cleanly.

import { useEffect, useState, type JSX } from "react";
import { Monitor, Network, Search, Server } from "lucide-react";

import { SectionCard } from "@/components/admin/primitives";

type Mode = "standalone" | "server" | "client";
type LabConfig = { mode: Mode; code: string; server: string };
type Found = { address: string; name: string };

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function saveAndRestart(config: LabConfig): Promise<void> {
  await call("save_lab_config", { config });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

const MODES: Array<{ mode: Mode; title: string; blurb: string; Icon: typeof Monitor }> = [
  {
    mode: "standalone",
    title: "This computer only",
    blurb: "Learners' progress stays on this PC. Use this when PCs aren't networked.",
    Icon: Monitor,
  },
  {
    mode: "server",
    title: "Lab server",
    blurb: "This PC keeps every learner's progress for the lab. Leave it on during lessons.",
    Icon: Server,
  },
  {
    mode: "client",
    title: "Lab computer",
    blurb: "Uses the lab server's records, so learners can sit at any PC.",
    Icon: Network,
  },
];

const BTN =
  "inline-flex min-h-[48px] w-fit items-center gap-2 rounded-full px-6 font-sans text-[17px] font-bold transition active:scale-[0.98] disabled:opacity-50";

export function LabCard(): JSX.Element | null {
  const [config, setConfig] = useState<LabConfig | null>(null);
  const [choice, setChoice] = useState<Mode>("standalone");
  const [thisPc, setThisPc] = useState<{ name: string; address: string | null } | null>(null);
  const [server, setServer] = useState("");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<LabConfig>("lab_config")
      .then((c) => {
        setConfig(c);
        setChoice(c.mode);
        setServer(c.server);
      })
      .catch(() => setConfig(null));
    call<{ name: string; address: string | null }>("lab_this_pc").then(setThisPc).catch(() => {});
  }, []);

  // Outside the desktop app (browser dev) there's no lab to set up.
  if (!config) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const find = () =>
    run(async () => {
      setFound(null);
      setFound(await call<Found[]>("lab_find_servers"));
    });

  const connect = () =>
    run(async () => {
      await call<string>("lab_test", { server, code });
      await saveAndRestart({ mode: "client", server, code });
    });

  const changed = choice !== config.mode;

  return (
    <SectionCard icon={Network} title="Computer lab" ariaLabel="Computer lab setup">
      <p className="max-w-[62ch] font-sans text-[18px] leading-relaxed text-ink-2">
        In a lab, one PC can keep everyone's progress so learners can sit at any computer. PCs that
        aren't on a network work on their own.
      </p>

      <div className="grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label="How this computer runs">
        {MODES.map(({ mode, title, blurb, Icon }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={choice === mode}
            onClick={() => {
              setChoice(mode);
              setError(null);
            }}
            className={`flex flex-col gap-2 rounded-tile border-2 p-4 text-left transition ${
              choice === mode ? "border-ink bg-canvas" : "border-line bg-surface hover:border-ink-3"
            }`}
          >
            <span className="flex items-center gap-2 font-sans text-[17px] font-bold text-ink">
              <Icon size={18} aria-hidden />
              {title}
              {config.mode === mode ? (
                <span className="ml-auto rounded-full bg-sun px-2.5 py-0.5 text-[13px] text-ink">Now</span>
              ) : null}
            </span>
            <span className="font-sans text-[15px] leading-snug text-ink-2">{blurb}</span>
          </button>
        ))}
      </div>

      {choice === "server" && config.mode === "server" ? (
        <div className="flex flex-col gap-3 rounded-tile bg-sun-tint p-5">
          <p className="font-sans text-[16px] font-bold text-ink">Lab code</p>
          <p className="font-heading text-[34px] font-extrabold tracking-[0.08em] text-ink tabular-nums">
            {config.code}
          </p>
          <p className="max-w-[62ch] font-sans text-[16px] leading-relaxed text-ink-2">
            On each lab computer, open Settings › System › Computer lab, choose Lab computer, pick{" "}
            <b>{thisPc?.name ?? "this PC"}</b>
            {thisPc?.address ? ` (${thisPc.address})` : ""} and type this code.
          </p>
        </div>
      ) : null}

      {choice === "server" && config.mode !== "server" ? (
        <div className="flex flex-col gap-3">
          <p className="max-w-[62ch] font-sans text-[16px] leading-relaxed text-ink-2">
            This PC's learners and their progress become the lab's records. Tusome restarts and shows
            a lab code to type on the other computers. If Windows asks whether Tusome may use the
            network, choose Allow.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => saveAndRestart({ mode: "server", code: "", server: "" }))}
            className={`${BTN} bg-brand text-white hover:bg-brand-hover`}
          >
            Make this the lab server
          </button>
        </div>
      ) : null}

      {choice === "client" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={find}
              className={`${BTN} border border-line bg-surface text-ink hover:bg-canvas`}
            >
              <Search size={18} aria-hidden />
              Find the lab server
            </button>
            {found?.map((f) => (
              <button
                key={f.address}
                type="button"
                onClick={() => setServer(f.address)}
                className={`${BTN} border-2 ${server === f.address ? "border-ink bg-canvas" : "border-line"} text-ink`}
              >
                <Server size={18} aria-hidden />
                {f.name} <span className="font-normal text-ink-3">{f.address}</span>
              </button>
            ))}
            {found && found.length === 0 ? (
              <span className="font-sans text-[16px] text-ink-3">
                None found. Type the server's address below.
              </span>
            ) : null}
          </div>
          <label className="flex flex-col gap-1.5 font-sans text-[16px] font-bold text-ink-2">
            Server address
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="e.g. 192.168.1.20"
              className="min-h-[48px] max-w-[320px] rounded-tile border border-line bg-surface px-4 font-sans text-[18px] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-sans text-[16px] font-bold text-ink-2">
            Lab code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="min-h-[48px] max-w-[320px] rounded-tile border border-line bg-surface px-4 font-heading text-[20px] tracking-[0.08em] text-ink"
            />
          </label>
          <button
            type="button"
            disabled={busy || !server.trim() || code.replace(/[^a-z0-9]/gi, "").length < 12}
            onClick={connect}
            className={`${BTN} bg-brand text-white hover:bg-brand-hover`}
          >
            {busy ? "Connecting…" : "Connect and restart"}
          </button>
        </div>
      ) : null}

      {choice === "standalone" && changed ? (
        <div className="flex flex-col gap-3">
          <p className="max-w-[62ch] font-sans text-[16px] leading-relaxed text-ink-2">
            {config.mode === "client"
              ? "This PC goes back to its own records. The lab's records stay on the server."
              : "Lab computers will stop finding this server. Its records stay on this PC."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => saveAndRestart({ mode: "standalone", code: "", server: "" }))}
            className={`${BTN} bg-brand text-white hover:bg-brand-hover`}
          >
            Use this computer only
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="max-w-[62ch] font-sans text-[16px] font-bold text-bad">
          {error}
        </p>
      ) : null}
    </SectionCard>
  );
}

// Back up / restore this PC's student records. Hidden on lab computers: their
// records live on the lab server, so that's where the backup belongs.
export function RecordsCard(): JSX.Element | null {
  const [mode, setMode] = useState<Mode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    call<LabConfig>("lab_config").then((c) => setMode(c.mode)).catch(() => setMode(null));
  }, []);

  if (mode === null || mode === "client") return null;

  async function backup() {
    setError(null);
    setMessage(null);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const day = new Date().toISOString().slice(0, 10);
      const dest = await save({
        defaultPath: `tusome-records-${day}.db`,
        filters: [{ name: "Tusome backup", extensions: ["db"] }],
      });
      if (!dest) return;
      await call("backup_records", { dest });
      setMessage("Backup saved. Keep it somewhere safe, such as a USB stick.");
    } catch (e) {
      setError(`Backup failed: ${String(e)}`);
    }
  }

  async function restore() {
    setError(null);
    setMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const src = await open({ filters: [{ name: "Tusome backup", extensions: ["db"] }] });
      if (typeof src !== "string") return;
      await call("restore_records", { src });
      setRestored(true);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <SectionCard icon={Server} title="Student records" ariaLabel="Back up or restore student records">
      <p className="max-w-[62ch] font-sans text-[18px] leading-relaxed text-ink-2">
        Save a copy of every learner and their progress, for example at the end of each term. If
        this PC breaks, install Tusome on another one and restore the copy.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void backup()} className={`${BTN} bg-brand text-white hover:bg-brand-hover`}>
          Back up records
        </button>
        <button
          type="button"
          onClick={() => void restore()}
          className={`${BTN} border border-line bg-surface text-ink hover:bg-canvas`}
        >
          Restore from a backup
        </button>
      </div>
      {restored ? (
        <div role="status" className="flex flex-wrap items-center gap-4 rounded-tile bg-sun-tint px-5 py-4">
          <p className="max-w-[52ch] font-sans text-[17px] text-ink">
            The backup replaces this PC's records when Tusome restarts.
          </p>
          <button
            type="button"
            onClick={() => void import("@tauri-apps/plugin-process").then(({ relaunch }) => relaunch())}
            className={`${BTN} bg-sun text-ink hover:bg-sun-hover`}
          >
            Restart now
          </button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="font-sans text-[16px] font-bold text-good">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="font-sans text-[16px] font-bold text-bad">
          {error}
        </p>
      ) : null}
    </SectionCard>
  );
}
