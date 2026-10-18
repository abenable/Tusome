import { describe, it, expect } from "bun:test";
import { Pack, Block } from "./schema";
import { loadPacks, loadPackForTopic, loadPacksWithErrors } from "./loader";
import { mkdir, writeFile, rm, readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { QueryClient } from "@tanstack/react-query";

describe("schema: Pack", () => {
  it("parses the real electricity-circuits pack", async () => {
    const { packs, skipped } = await loadPacks();
    expect(skipped).toEqual([]);
    expect(packs.length).toBeGreaterThanOrEqual(1);

    const circuits = packs.find((p) => p.packId === "phy.s4.electricity.circuits");
    expect(circuits).toBeDefined();
    expect(circuits!.schemaVersion).toBe(1);
    expect(circuits!.topics.length).toBe(1);

    const topic = circuits!.topics[0];
    expect(topic.id).toBe("phy.s4.electricity.circuits");
    expect(topic.subject).toBe("physics");
    expect(topic.level).toBe("S4");

    // Sim reference: a vendored PhET HTML5 sim, not a custom TS module.
    expect(topic.sim).toBeDefined();
    const sim = topic.sim!;
    expect("phet" in sim).toBe(true);
    if ("phet" in sim) {
      expect(sim.phet).toBe("circuit-construction-kit-dc_en.html");
    }
  });

  it("loadPackForTopic returns the electricity-circuits topic", async () => {
    const result = await loadPackForTopic("phy.s4.electricity.circuits");
    expect(result).not.toBeNull();
    expect(result!.topic.id).toBe("phy.s4.electricity.circuits");
  });
});

describe("schema: Pack rejects bad data", () => {
  it("rejects a pack with the wrong schemaVersion", () => {
    const bad = {
      packId: "phy.s4.electricity.circuits",
      version: 1,
      schemaVersion: 2, // wrong — only 1 is allowed
      topics: [],
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

describe("loader: malformed packs are skipped, never thrown", () => {
  // The loader reads from the content dir. We build a throwaway tree in the OS
  // temp dir — containing a copy of the real electricity-circuits pack AND a malformed
  // pack — and point the loader at it via CBL_CONTENT_DIR. That keeps the test
  // out of the curated content tree (an interrupted run used to leave a broken
  // pack in content/z-test-malformed) while still exercising the real walk +
  // parse + skip path.

  it("skips a malformed pack without throwing and keeps valid packs", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "tusome-test-"));

    // Copy the real pack so `packs` has something valid alongside the bad one.
    const realPackSrc = join(
      import.meta.dirname,
      "..",
      "..",
      "content",
      "physics",
      "s4-electricity-circuits",
      "pack.json",
    );
    const realPack = await readFile(realPackSrc, "utf-8");
    await mkdir(join(tmp, "physics", "s4-electricity-circuits"), { recursive: true });
    await writeFile(join(tmp, "physics", "s4-electricity-circuits", "pack.json"), realPack);

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
        result.packs.some((p) => p.packId === "phy.s4.electricity.circuits"),
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
    const tmp = await mkdtemp(join(tmpdir(), "tusome-admin-"));

    // A valid pack alongside the broken one, so `packs` isn't empty.
    const realPackSrc = join(
      import.meta.dirname,
      "..",
      "..",
      "content",
      "physics",
      "s4-electricity-circuits",
      "pack.json",
    );
    const realPack = await readFile(realPackSrc, "utf-8");
    await mkdir(join(tmp, "physics", "s4-electricity-circuits"), { recursive: true });
    await writeFile(join(tmp, "physics", "s4-electricity-circuits", "pack.json"), realPack);

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
      expect(packs.some((p) => p.packId === "phy.s4.electricity.circuits")).toBe(
        true,
      );
    } finally {
      delete process.env.CBL_CONTENT_DIR;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns empty errors when all packs validate", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "tusome-admin-clean-"));
    const realPackSrc = join(
      import.meta.dirname,
      "..",
      "..",
      "content",
      "physics",
      "s4-electricity-circuits",
      "pack.json",
    );
    const realPack = await readFile(realPackSrc, "utf-8");
    await mkdir(join(tmp, "physics", "s4-electricity-circuits"), { recursive: true });
    await writeFile(join(tmp, "physics", "s4-electricity-circuits", "pack.json"), realPack);

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
