import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ConfiguredSource,
  Workspace,
} from "./types/workspace.types.js";

export type ResolvedSource = ConfiguredSource & {
  sourceRoot: string;
};

export async function resolveSources(
  workspace: Workspace,
): Promise<ResolvedSource[]> {
  const sourcePromises: Promise<ResolvedSource>[] = [];

  workspace.sources.forEach((source) => {
    sourcePromises.push(resolveSource(workspace.root, source));
  });

  return Promise.all(sourcePromises);
}

async function resolveSource(
  workspaceRoot: string,
  source: ConfiguredSource,
): Promise<ResolvedSource> {
  const configuredPath = resolve(workspaceRoot, source.path);
  const sourceRoot = await realpath(configuredPath);

  return {
    ...source,
    sourceRoot,
  };
}
