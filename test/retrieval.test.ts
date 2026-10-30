import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ReadResult } from "../src/commands/read.js";
import type { SearchResult } from "../src/commands/search.js";
import type { DianaConfig } from "../src/types/workspace.types.js";
import { createTempTestDir, removeTestDir } from "./utils.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

describe("CLI retrieval behavior", () => {
  let directory: string;

  function cli(...args: string[]): string {
    return execFileSync(process.execPath, [cliPath, ...args], {
      cwd: directory,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 10_000,
    });
  }

  function search(query: string): SearchResult[] {
    return JSON.parse(cli("search", query));
  }

  function read(path: string, section?: string): ReadResult {
    return JSON.parse(
      cli(
        "read",
        path,
        ...(section === undefined ? [] : ["--section", section])
      )
    );
  }

  async function configure(sources: DianaConfig["sources"]): Promise<void> {
    await writeFile(
      join(directory, "diana.config.json"),
      JSON.stringify({ version: 1, sources } satisfies DianaConfig)
    );
  }

  async function note(path: string, content: string): Promise<void> {
    await writeFile(join(directory, "notes", path), content);
  }

  beforeEach(async () => {
    directory = await createTempTestDir();
    cli("init");
    await mkdir(join(directory, "notes"));
    await configure([{ path: "notes", include: ["**/*.md"], exclude: [] }]);
  });

  afterEach(async () => await removeTestDir(directory));

  it("replaces all old sections when a document changes and stays stable on reindex", async () => {
    await note(
      "changing.md",
      "# Old title\n\nPapaya.\n\n## Old section\n\nGuava.\n"
    );
    await note("stable.md", "# Stable\n\nLychee.\n");
    cli("index");
    expect(search("papaya")).toHaveLength(1);
    expect(search("guava")).toHaveLength(1);
    const stableResults = search("lychee");
    expect(stableResults).toHaveLength(1);

    await note("changing.md", "# Replacement\n\nTamarind.\n");
    cli("index");

    expect(search("papaya")).toEqual([]);
    expect(search("guava")).toEqual([]);
    expect(search("tamarind")).toEqual([
      expect.objectContaining({
        path: "changing.md",
        title: "Replacement",
        heading: "Replacement",
        anchor: "replacement",
      }),
    ]);
    expect(search("lychee")).toEqual(stableResults);

    cli("index");
    expect(search("tamarind")).toHaveLength(1);
    expect(search("lychee")).toEqual(stableResults);
  });

  it("removes deleted documents without removing surviving documents", async () => {
    await note("deleted.md", "# Deleted\n\nPapaya.\n\n## Details\n\nGuava.\n");
    await note("kept.md", "# Kept\n\nLychee.\n");
    cli("index");
    expect(search("papaya")).toHaveLength(1);
    expect(search("guava")).toHaveLength(1);
    const keptResults = search("lychee");
    expect(keptResults).toHaveLength(1);

    await rm(join(directory, "notes", "deleted.md"));
    cli("index");

    expect(search("papaya")).toEqual([]);
    expect(search("guava")).toEqual([]);
    expect(search("lychee")).toEqual(keptResults);
  });

  it("removes unconfigured sources and can index them again unchanged", async () => {
    await mkdir(join(directory, "other"));
    await note("shared.md", "# Kept\n\nLychee.\n");
    await writeFile(
      join(directory, "other", "shared.md"),
      "# Removed\n\nPapaya.\n"
    );
    const sources: DianaConfig["sources"] = [
      { path: "notes", include: ["**/*.md"], exclude: [] },
      { path: "other", include: ["**/*.md"], exclude: [] },
    ];
    await configure(sources);
    cli("index");
    const removedResults = search("papaya");
    expect(removedResults).toHaveLength(1);
    const keptResults = search("lychee");
    expect(keptResults).toHaveLength(1);

    await configure(sources.slice(0, 1));
    cli("index");
    expect(search("papaya")).toEqual([]);
    expect(search("lychee")).toEqual(keptResults);

    await configure(sources);
    cli("index");
    expect(search("papaya")).toEqual(removedResults);
    expect(search("lychee")).toEqual(keptResults);
  });

  it("returns distinct readable anchors for repeated and normalized duplicate headings", async () => {
    await note(
      "duplicates.md",
      "# Repeated\n\nPapaya.\n\n## Repeated\n\nGuava.\n\n## Répeated!\n\nLychee.\n"
    );
    cli("index");

    for (const [term, anchor, content] of [
      ["papaya", "repeated", "# Repeated\n\nPapaya.\n"],
      ["guava", "repeated-1", "## Repeated\n\nGuava.\n"],
      ["lychee", "repeated-2", "## Répeated!\n\nLychee.\n"],
    ] as const) {
      const results = search(term);
      expect(results).toEqual([
        expect.objectContaining({ path: "duplicates.md", anchor }),
      ]);
      expect(
        read(`notes/${results[0]!.path}`, results[0]!.anchor)
      ).toMatchObject({
        content,
        truncated: false,
      });
    }
  });

  it("finds notes without headings and preserves their full text on read", async () => {
    const content =
      "Papaya appears in a headingless note.\n\nAnother paragraph.\n";
    await note("plain-note.md", content);
    cli("index");

    expect(search("papaya")).toEqual([
      expect.objectContaining({ path: "plain-note.md", title: "plain-note" }),
    ]);
    expect(read("notes/plain-note.md")).toMatchObject({
      content,
      truncated: false,
    });
  });

  it("finds text before the first heading as well as text after it", async () => {
    const content =
      "Papaya is in the preamble.\n\n# Main\n\nGuava is under the heading.\n";
    await note("preamble.md", content);
    cli("index");

    for (const term of ["papaya", "guava"]) {
      expect(search(term)).toEqual([
        expect.objectContaining({ path: "preamble.md", title: "Main" }),
      ]);
    }
    expect(read("notes/preamble.md").content).toBe(content);
  });

  it("skips symlinked files, directories, loops, and dangling entries", async () => {
    await mkdir(join(directory, "outside"));
    await writeFile(join(directory, "outside", "secret.md"), "Papaya.");
    await note("real.md", "Guava.");
    await symlink(
      "../outside/secret.md",
      join(directory, "notes", "linked.md")
    );
    await symlink(
      "../outside",
      join(directory, "notes", "linked-directory"),
      "dir"
    );
    await symlink("real.md", join(directory, "notes", "alias.md"));
    await symlink(".", join(directory, "notes", "loop"), "dir");
    await symlink("missing.md", join(directory, "notes", "dangling.md"));
    cli("index");

    expect(search("papaya")).toEqual([]);
    expect(search("guava")).toEqual([
      expect.objectContaining({ path: "real.md" }),
    ]);
  });

  it("applies source-relative include/exclude boundaries to indexing and reads", async () => {
    await mkdir(join(directory, "notes", "nested"));
    await mkdir(join(directory, "notes", "private"));
    await mkdir(join(directory, "notes", "private-copy"));
    const included = [
      "root.md",
      "nested/allowed.md",
      "nested/blocked.md",
      "private-copy/allowed.md",
    ];
    const excluded = [
      "blocked.md",
      "private/secret.md",
      "nested/unmatched.txt",
      ".hidden.md",
    ];
    for (const path of [...included, ...excluded]) {
      await note(path, "Boundaryterm.");
    }
    await configure([
      {
        path: "notes",
        include: ["**/*.md"],
        exclude: ["blocked.md", "private/**"],
      },
    ]);
    cli("index");

    expect(
      search("boundaryterm")
        .map((result) => result.path)
        .sort()
    ).toEqual([...included].sort());
    for (const path of included) {
      expect(read(`notes/${path}`).content).toBe("Boundaryterm.");
    }
    for (const path of excluded) {
      expect(() => read(`notes/${path}`)).toThrow(
        "Path is not a readable Markdown file"
      );
    }
  });

  it("removes old matches when include/exclude patterns change", async () => {
    await mkdir(join(directory, "notes", "nested"));
    await note("root.md", "Boundaryterm.");
    await note("nested/allowed.md", "Boundaryterm.");
    await note("nested/blocked.md", "Boundaryterm.");
    cli("index");
    expect(search("boundaryterm")).toHaveLength(3);

    await configure([
      { path: "notes", include: ["nested/*.md"], exclude: ["**/blocked.md"] },
    ]);
    cli("index");
    expect(search("boundaryterm")).toEqual([
      expect.objectContaining({ path: "nested/allowed.md" }),
    ]);
    expect(() => read("notes/root.md")).toThrow(
      "Path is not a readable Markdown file"
    );
    expect(() => read("notes/nested/blocked.md")).toThrow(
      "Path is not a readable Markdown file"
    );
  });

  it.each([65535, 65536, 65537])(
    "bounds whole-note and section reads at %i characters",
    async (length) => {
      // Non-ASCII text proves this is a character bound, not a UTF-8 byte bound.
      const content = "# Target\n" + "é".repeat(length - 9);
      await note("bounded.md", content);

      for (const result of [
        read("notes/bounded.md"),
        read("notes/bounded.md", "target"),
      ]) {
        expect(result).toMatchObject({
          path: "bounded.md",
          content: content.slice(0, 65536),
          truncated: length > 65536,
        });
      }
    }
  );

  it("selects a late section before applying the output bound and stops at the next heading", async () => {
    await note(
      "late.md",
      "# Introduction\n" +
        "x".repeat(70 * 1024) +
        "\n## Target\n\nSelected text.\n\n### Child\n\nNot selected.\n"
    );
    cli("index");
    expect(search("Selected text")).toEqual([
      expect.objectContaining({ path: "late.md", anchor: "target" }),
    ]);

    expect(read("notes/late.md", "target")).toMatchObject({
      content: "## Target\n\nSelected text.\n",
      truncated: false,
    });
    expect(read("notes/late.md").truncated).toBe(true);
  });

  it("rejects an unknown section rather than returning the whole note", async () => {
    await note("missing-section.md", "# Present\n\nPapaya.\n");
    expect(() => read("notes/missing-section.md", "missing")).toThrow(
      "Section not found: missing."
    );
  });

  it("rejects oversized notes even when the requested section is small", async () => {
    await note(
      "oversized.md",
      "# Target\nSmall section.\n\n# Large\n" + "x".repeat(1024 * 1024)
    );
    expect(() => read("notes/oversized.md", "target")).toThrow(
      "exceeds the 1048576-byte read limit"
    );
  });
});
