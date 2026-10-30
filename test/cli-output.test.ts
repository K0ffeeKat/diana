import { spawnSync } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempTestDir, removeTestDir } from "./utils.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

describe("CLI output and exit codes", () => {
  let directory: string;

  function cli(...args: string[]) {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    expect(result.signal).toBeNull();
    return result;
  }

  async function configureWorkspace(): Promise<void> {
    expect(cli("init").status).toBe(0);
    await mkdir(join(directory, "notes"));
    await writeFile(
      join(directory, "notes", "example.md"),
      "# Example\n\nTamarind.\n"
    );
    await writeFile(
      join(directory, "diana.config.json"),
      JSON.stringify({
        version: 1,
        sources: [{ path: "notes", include: ["**/*.md"], exclude: [] }],
      })
    );
  }

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it.each([[], ["--help"], ["-h"]])(
    "shows available commands for %j",
    (...args) => {
      const result = cli(...args);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("  init\n");
      expect(result.stdout).toContain("  index\n");
      expect(result.stdout).toContain("  search <query...>\n");
      expect(result.stdout).toContain("  read <path> [--section <anchor>]\n");
      expect(result.stdout).not.toContain("setup");
    }
  );

  it.each(["unknown", "setup", "--unknown"])(
    "rejects unavailable command %s",
    (command) => {
      const result = cli(command);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `Error: Unknown command: ${command}\nRun "diana --help" for usage.\n`
      );
    }
  );

  it.each([
    ["init", "--source", "notes"],
    ["init", "extra"],
    ["index", "--unknown"],
    ["index", "extra"],
    ["--help", "extra"],
    ["-h", "extra"],
  ])("rejects unexpected arguments for %s", (command, ...args) => {
    const result = cli(command, ...args);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Error: Usage: diana ${command}.\n`);
  });

  it("explains how to configure and index a newly initialized workspace", () => {
    const result = cli("init");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      'Initialized Diana workspace.\nAdd sources to diana.config.json or .diana/local.config.json, then run "diana index".\n'
    );
  });

  it("confirms indexing succeeds, including when the index is unchanged", async () => {
    await configureWorkspace();

    for (let run = 0; run < 2; run++) {
      const result = cli("index");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("Index updated.\n");
      expect(result.stderr).toBe("");
    }
  });

  it.each([["index"], ["search", "tamarind"], ["read", "notes/example.md"]])(
    "reports missing workspace errors cleanly for %s",
    async (...args) => {
      const result = cli(...args);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `Error: No configuration file found at ${await realpath(directory)}. Run "diana init" to create diana.config.json.\n`
      );
    }
  );

  it("returns only the existing search-result JSON schema on stdout", async () => {
    await configureWorkspace();
    expect(cli("index").status).toBe(0);
    const result = cli("search", "tamarind");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual([
      {
        sourceRoot: await realpath(join(directory, "notes")),
        path: "example.md",
        title: "Example",
        heading: "Example",
        anchor: "example",
        excerpt: "Tamarind.",
      },
    ]);
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("returns an empty JSON array and succeeds when search finds no matches", async () => {
    await configureWorkspace();
    expect(cli("index").status).toBe(0);
    const result = cli("search", "tamarind", "nonexistent");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[]\n");
    expect(result.stderr).toBe("");
  });

  it.each([[], ["--section", "example"]])(
    "returns only the existing read-result JSON schema for %j",
    async (...options) => {
      await configureWorkspace();
      // Reads must work without requiring an index.
      const result = cli("read", "notes/example.md", ...options);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        sourceRoot: await realpath(join(directory, "notes")),
        path: "example.md",
        content: "# Example\n\nTamarind.\n",
        truncated: false,
      });
      expect(result.stdout.endsWith("\n")).toBe(true);
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
    }
  );

  it.each([
    { args: ["search"], message: "Search query must not be empty." },
    { args: ["search", "  "], message: "Search query must not be empty." },
    { args: ["read"], message: "Read path must not be empty." },
    {
      args: ["read", "notes/example.md", "--section"],
      message: "Usage: diana read <path> [--section <anchor>].",
    },
    {
      args: ["read", "notes/example.md", "--section", ""],
      message: "Usage: diana read <path> [--section <anchor>].",
    },
    {
      args: ["read", "notes/example.md", "--unknown", "example"],
      message: "Usage: diana read <path> [--section <anchor>].",
    },
    {
      args: ["read", "notes/example.md", "--section", "example", "extra"],
      message: "Usage: diana read <path> [--section <anchor>].",
    },
  ])(
    "reports invalid arguments $args without stdout or stack traces",
    ({ args, message }) => {
      const result = cli(...args);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(`Error: ${message}\n`);
    }
  );

  it("reports an absent index without emitting JSON or a success message", async () => {
    await configureWorkspace();
    const result = cli("search", "tamarind");

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Error: No index found. Run diana index first.\n"
    );
  });

  it.each([["index"], ["search", "tamarind"], ["read", "notes/example.md"]])(
    "reports malformed configuration cleanly for %s",
    async (...args) => {
      await writeFile(join(directory, "diana.config.json"), "{ invalid JSON");
      const result = cli(...args);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `Error: Invalid Diana configuration at ${join(await realpath(directory), "diana.config.json")}: invalid JSON.\n`
      );
    }
  );
});
