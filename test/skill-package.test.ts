import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("agent skill packaging", () => {
  it("exposes the same standalone skill to Pi, Claude Code, and Codex", async () => {
    // Codex's native installer accepts this repository directory directly.
    const skillPath = await realpath(
      join(projectRoot, "skills/diana/SKILL.md")
    );
    const packageInfo = await readJson(join(projectRoot, "package.json"));
    expect(
      await realpath(
        join(projectRoot, packageInfo.pi.skills[0], "diana/SKILL.md")
      )
    ).toBe(skillPath);

    const marketplace = await readJson(
      join(projectRoot, ".claude-plugin/marketplace.json")
    );
    const entry = marketplace.plugins[0];
    const pluginRoot = resolve(projectRoot, entry.source);
    const plugin = await readJson(
      join(pluginRoot, ".claude-plugin/plugin.json")
    );

    expect(plugin.name).toBe(entry.name);
    expect(plugin.name).toBe("diana");
    // Claude discovers skills/ by convention; no extra copy is required.
    expect(await realpath(join(pluginRoot, "skills/diana/SKILL.md"))).toBe(
      skillPath
    );
  });

  it("keeps the plugin version aligned with the existing package version", async () => {
    const packageInfo = await readJson(join(projectRoot, "package.json"));
    const plugin = await readJson(
      join(projectRoot, ".claude-plugin/plugin.json")
    );

    expect(plugin.version).toBe(packageInfo.version);
  });
});
