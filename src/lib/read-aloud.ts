// Read-aloud: speaks a list of chunks one at a time and reports which one is
// being spoken, so the lesson can highlight it.
//
// Two engines, picked once:
//   - Web Speech (`speechSynthesis`): WebView2 on Windows has it, with the
//     voices installed on the PC (Microsoft David/Zira/Hazel...).
//   - The Rust `speak` command: Ubuntu's WebKitGTK is built without Web
//     Speech, so on Linux we shell out to speech-dispatcher (`spd-say`).
// If neither is there, `useReadAloud().available` is false and the lesson
// hides its Listen button.
//
// Pause = stop after remembering where we were; resume restarts that chunk.
// That behaves the same on both engines (Chromium's own pause() is flaky).

import { useCallback, useEffect, useRef, useState } from "react"

import type { Chunk } from "./speech"

type Engine = {
  speak(text: string, rate: number): Promise<void>
  cancel(): void
}

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in globalThis
}

function englishVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"))
  // British English is closest to how English is taught in Uganda.
  return voices.find((v) => v.lang === "en-GB") ?? voices[0] ?? null
}

const webSpeech: Engine = {
  speak(text, rate) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      const voice = englishVoice()
      if (voice) u.voice = voice
      u.lang = voice?.lang ?? "en-GB"
      u.rate = rate
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    })
  },
  cancel() {
    speechSynthesis.cancel()
  },
}

const nativeSpeech: Engine = {
  async speak(text, rate) {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("speak", { text, rate }).catch(() => {})
  },
  cancel() {
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("stop_speaking").catch(() => {}),
    )
  },
}

let enginePromise: Promise<Engine | null> | null = null

/** The engine to use on this machine, or null when it can't speak. */
export function getEngine(): Promise<Engine | null> {
  enginePromise ??= (async () => {
    if ("speechSynthesis" in globalThis) {
      // Voices load asynchronously; give them a moment on first use.
      if (speechSynthesis.getVoices().length === 0) {
        await new Promise<void>((r) => {
          speechSynthesis.addEventListener("voiceschanged", () => r(), { once: true })
          setTimeout(r, 1500)
        })
      }
      if (englishVoice()) return webSpeech
    }
    if (isTauri()) {
      const { invoke } = await import("@tauri-apps/api/core")
      if (await invoke<boolean>("speech_available").catch(() => false)) return nativeSpeech
    }
    return null
  })()
  return enginePromise
}

export type ReadAloud = {
  available: boolean
  status: "idle" | "playing" | "paused"
  /** Key of the chunk being spoken, or null. */
  active: string | null
  slow: boolean
  setSlow(slow: boolean): void
  play(): void
  pause(): void
  stop(): void
}

export function useReadAloud(chunks: Chunk[]): ReadAloud {
  const [engine, setEngine] = useState<Engine | null>(null)
  const [status, setStatus] = useState<ReadAloud["status"]>("idle")
  const [index, setIndex] = useState(0)
  const [slow, setSlow] = useState(false)
  // Bumped on every stop/pause so a chunk that finishes afterwards doesn't
  // advance a run that's already been cancelled.
  const run = useRef(0)

  useEffect(() => {
    let live = true
    void getEngine().then((e) => live && setEngine(e))
    return () => {
      live = false
    }
  }, [])

  // New lesson (or slide): start from the top.
  useEffect(() => {
    run.current++
    engine?.cancel()
    setStatus("idle")
    setIndex(0)
  }, [chunks, engine])

  useEffect(() => () => engine?.cancel(), [engine])

  useEffect(() => {
    if (status !== "playing" || !engine) return
    if (index >= chunks.length) {
      setStatus("idle")
      setIndex(0)
      return
    }
    const mine = ++run.current
    void engine.speak(chunks[index].text, slow ? 0.8 : 1).then(() => {
      if (run.current === mine) setIndex((i) => i + 1)
    })
  }, [status, index, chunks, engine, slow])

  const halt = useCallback(() => {
    run.current++
    engine?.cancel()
  }, [engine])

  return {
    available: engine !== null && chunks.length > 0,
    status,
    active: status === "idle" ? null : (chunks[index]?.key ?? null),
    slow,
    setSlow(next) {
      halt()
      setSlow(next)
    },
    play: () => setStatus("playing"),
    pause() {
      halt()
      setStatus("paused")
    },
    stop() {
      halt()
      setStatus("idle")
      setIndex(0)
    },
  }
}
