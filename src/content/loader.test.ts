import { describe, it, expect } from "bun:test";
import { Pack, Block } from "./schema";
import { loadPacks, loadPackForTopic, loadPacksWithErrors } from "./loader";
import { mkdir, writeFile, rm, readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { QueryClient } from "@tanstack/react-query";

describe("schema: Pack", () => {
  it("parses the real projectile pack", async () => {
    const { packs, skipped } = await loadPacks();
    expect(skipped).toEqual([]);
    expect(packs.length).toBeGreaterThanOrEqual(1);

    const projectile = packs.find((p) => p.packId === "phy.s2.motion.projectile");
    expect(projectile).toBeDefined();
    expect(projectile!.schemaVersion).toBe(1);
    expect(projectile!.topics.length).toBe(1);

    const topic = projectile!.topics[0];
    expect(topic.id).toBe("phy.s2.motion.projectile");
    expect(topic.subject).toBe("physics");
    expect(topic.level).toBe("S2");

    // Exactly five questions, every one with a non-empty explanation.
    expect(topic.quiz.length).toBe(5);
    for (const q of topic.quiz) {
      expect(q.explanation.length).toBeGreaterThan(0);
    }

    // Sim reference: projectile, no mass param.
    expect(topic.sim).toBeDefined();
    const sim = topic.sim!;
    expect("simId" in sim).toBe(true);
    if ("simId" in sim) {
      expect(sim.simId).toBe("projectile");
      expect(sim.params).not.toHaveProperty("mass");
      expect(sim.params).toHaveProperty("gravity");
    }
  });

  it("loadPackForTopic returns the projectile topic", async () => {
    const result = await loadPackForTopic("phy.s2.motion.projectile");
    expect(result).not.toBeNull();
    expect(result!.topic.id).toBe("phy.s2.motion.projectile");
  });
});

describe("schema: Pack rejects bad data", () => {
  it("rejects a pack with the wrong schemaVersion", () => {
    const bad = {
      packId: "phy.s2.motion.projectile",
      version: 1,
      schemaVersion: 2, // wrong — only 1 is allowed
      topics: [],
    };
    const result = Pack.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a pack whose question has no explanation", () => {
    const bad = {
      packId: "phy.s2.bad",
      version: 1,
      schemaVersion: 1,
      topics: [
        {
          id: "phy.s2.bad",
          title: "Bad",
          subject: "physics",
          level: "S2",
          strand: "Motion",
          subStrand: "Projectiles",
          outcomes: ["an outcome"],
          body: [{ type: "text", text: "hello" }],
          quiz: [
            {
              id: "q1",
              prompt: "Why?",
              kind: "single",
              options: [{ id: "a", text: "a" }],
              correct: ["a"],
              // explanation intentionally missing
            },
          ],
        },
      ],
    };
    const result = Pack.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a pack with no topics", () => {
    const bad = {
      packId: "phy.s2.empty",
      version: 1,
      schemaVersion: 1,
      topics: [],
    };
    const result = Pack.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer version", () => {
    const bad = {
      packId: "phy.s2.bad",
      version: 1.5,
      schemaVersion: 1,
      topics: [],
    };
    const result = Pack.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("schema: image block src refine", () => {
  it("rejects an absolute POSIX path", () => {
    const result = Block.safeParse({ type: "image", src: "/abs/img.png", alt: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an https URL", () => {
    const result = Block.safeParse({
      type: "image",
      src: "https://example.com/img.png",
      alt: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a Windows drive-letter path", () => {
    const result = Block.safeParse({
      type: "image",
      src: "C:\\Users\\img.png",
      alt: "x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a relative path", () => {
    const result = Block.safeParse({
      type: "image",
      src: "figures/diagram.png",
      alt: "A diagram",
    });
    expect(result.success).toBe(true);
  });
});

describe("schema: Block discriminated union", () => {
  it("parses a text block", () => {
    const result = Block.safeParse({ type: "text", text: "hi" });
    expect(result.success).toBe(true);
  });

  it("parses an equation block (latex)", () => {
    const result = Block.safeParse({ type: "equation", latex: "E=mc^2" });
    expect(result.success).toBe(true);
  });

  it("parses an equation block (expr)", () => {
    const result = Block.safeParse({ type: "equation", expr: "v^2 / g" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const result = Block.safeParse({ type: "video", src: "x" });
    expect(result.success).toBe(false);
  });
});

describe("schema: Question superRefine (unanswerable questions)", () => {
  // The three kinds the schema used to accept silently: an options-less single
  // (renders zero inputs → Submit stuck), a numeric whose correct isn't a
  // number (can never be right), and a single whose correct id isn't an option.
  // Each must now be rejected at parse time.
  function base(over: Record<string, unknown>) {
    return {
      packId: "phy.s2.q",
      version: 1,
      schemaVersion: 1,
      topics: [
        {
          id: "phy.s2.q",
          title: "Q",
          subject: "physics",
          level: "S2",
          strand: "s",
          subStrand: "s",
          outcomes: ["o"],
          body: [{ type: "text", text: "x" }],
          quiz: [
            {
              id: "q1",
              prompt: "Why?",
              kind: "single",
              options: [{ id: "a", text: "a" }, { id: "b", text: "b" }],
              correct: ["a"],
              explanation: "because",
              ...over,
            },
          ],
        },
      ],
    };
  }

  it("rejects a single question without options", () => {
    const r = Pack.safeParse(
      base({ kind: "single", options: undefined, correct: ["x"], explanation: "e" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a single question whose correct id is not among options", () => {
    const r = Pack.safeParse(base({ kind: "single", correct: ["zzz"] }));
    expect(r.success).toBe(false);
  });

  it("rejects a single question with more than one correct answer", () => {
    const r = Pack.safeParse(base({ kind: "single", correct: ["a", "b"] }));
    expect(r.success).toBe(false);
  });

  it("rejects a multi question without options", () => {
    const r = Pack.safeParse(
      base({ kind: "multi", options: undefined, correct: ["a"], explanation: "e" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a numeric question whose correct does not parse to a number", () => {
    const r = Pack.safeParse(
      base({ kind: "numeric", options: undefined, correct: ["abc"], explanation: "e" }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a numeric question that carries options", () => {
    const r = Pack.safeParse(
      base({ kind: "numeric", options: [{ id: "a", text: "a" }], correct: ["5"] }),
    );
    expect(r.success).toBe(false);
  });

  it("accepts a well-formed numeric question", () => {
    const r = Pack.safeParse(
      base({ kind: "numeric", options: undefined, correct: ["9.8"], tolerance: 0.1 }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts a well-formed multi question", () => {
    const r = Pack.safeParse(base({ kind: "multi", correct: ["a", "b"] }));
    expect(r.success).toBe(true);
  });
});

describe("loader: malformed packs are skipped, never thrown", () => {
  // The loader reads from the content dir. We build a throwaway tree in the OS
  // temp dir — containing a copy of the real projectile pack AND a malformed
  // pack — and point the loader at it via CBL_CONTENT_DIR. That keeps the test
  // out of the curated content tree (an interrupted run used to leave a broken
  // pack in content/z-test-malformed) while still exercising the real walk +
  // parse + skip path.

  it("skips a malformed pack without throwing and keeps valid packs", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cbclab-test-"));

    // Copy the real pack so `packs` has something valid alongside the bad one.
    const realPackSrc = join(
      import.meta.dirname,
      "..",
      "..",
      "content",
      "physics",
      "s2-projectile",
      "pack.json",
    );
    const realPack = await readFile(realPackSrc, "utf-8");
    await mkdir(join(tmp, "physics", "s2-projectile"), { recursive: true });
    await writeFile(join(tmp, "physics", "s2-projectile", "pack.json"), realPack);

    // A malformed pack: invalid `version` (string, not number).
    await mkdir(join(tmp, "z-test-malformed", "broken"), { recursive: true });
    await writeFile(
      join(tmp, "z-test-malformed", "broken", "pack.json"),
      JSON.stringify({
        packId: "broken",
        version: "not-a-number",
        schemaVersion: 1,
        topics: [],
      }),
    );

    process.env.CBL_CONTENT_DIR = tmp;
    try {
      // If the loader throws on a malformed pack, this await rejects and the
      // test fails — that's the contract we're checking.
      const result = await loadPacks();
      expect(result.skipped.length).toBeGreaterThanOrEqual(1);
      expect(result.skipped.some((s) => s.path.includes("broken"))).toBe(true);
      // The real pack still loaded alongside the broken one.
      expect(
        result.packs.some((p) => p.packId === "phy.s2.motion.projectile"),
      ).toBe(true);
    } finally {
      delete process.env.CBL_CONTENT_DIR;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// W7: the admin-facing loader. `loadPacksWithErrors` re-exposes the loader's
// `skipped` array under the name `errors` so the AdminPanel can surface
// invalid packs in its log. The behaviour is identical to `loadPacksCached`
// — only the returned field name changes — so these tests assert both that a
// malformed pack lands in `errors` (not `packs`) and that valid packs survive.
describe("loadPacksWithErrors (W7 admin loader)", () => {
  it("returns { packs, errors } with a malformed pack in errors, not packs", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cbclab-admin-"));

    // A valid pack alongside the broken one, so `packs` isn't empty.
    const realPackSrc = join(
      import.meta.dirname,
      "..",
      "..",
      "content",
      "physics",
      "s2-projectile",
      "pack.json",
    );
    const realPack = await readFile(realPackSrc, "utf-8");
    await mkdir(join(tmp, "physics", "s2-projectile"), { recursive: true });
    await writeFile(join(tmp, "physics", "s2-projectile", "pack.json"), realPack);

    // Malformed: `version` is a string, not a number.
    await mkdir(join(tmp, "z-test-malformed", "broken"), { recursive: true });
    await writeFile(
      join(tmp, "z-test-malformed", "broken", "pack.json"),
      JSON.stringify({
        packId: "broken",
        version: "not-a-number",
        schemaVersion: 1,
        topics: [],
      }),
    );

    process.env.CBL_CONTENT_DIR = tmp;
    try {
      const qc = new QueryClient();
      const { packs, errors } = await loadPacksWithErrors(qc);

      // The broken pack is in `errors`, never in `packs`.
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.path.includes("broken"))).toBe(true);
      expect(packs.some((p) => p.packId === "broken")).toBe(false);

      // The valid pack survives alongside the broken one.
      expect(packs.some((p) => p.packId === "phy.s2.motion.projectile")).toBe(
        true,
      );
    } finally {
      delete process.env.CBL_CONTENT_DIR;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns empty errors when all packs validate", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cbclab-admin-clean-"));
    const realPackSrc = join(
      import.meta.dirname,
      "..",
      "..",
      "content",
      "physics",
      "s2-projectile",
      "pack.json",
    );
    const realPack = await readFile(realPackSrc, "utf-8");
    await mkdir(join(tmp, "physics", "s2-projectile"), { recursive: true });
    await writeFile(join(tmp, "physics", "s2-projectile", "pack.json"), realPack);

    process.env.CBL_CONTENT_DIR = tmp;
    try {
      const qc = new QueryClient();
      const { packs, errors } = await loadPacksWithErrors(qc);
      expect(errors).toEqual([]);
      expect(packs.length).toBeGreaterThanOrEqual(1);
    } finally {
      delete process.env.CBL_CONTENT_DIR;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
