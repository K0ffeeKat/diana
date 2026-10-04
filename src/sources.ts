import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ConfiguredSource, Workspace } from "./types/workspace.types.js";
import type { ResolvedSource } from "./types/source.types.js";

export const SOURCE_ERRORS = {
  sourceMustBeDirError: (sourceId: string, sourceRoot: string) =>
    `Source ${sourceId} must be a directory: ${sourceRoot}.`,
  sharedSourceOutsideWorkspaceError: (sourceId: string, sourceRoot: string) =>
    `Shared source ${sourceId} must be inside the workspace: ${sourceRoot}.`,
} as const;

const { sourceMustBeDirError, sharedSourceOutsideWorkspaceError } =
  SOURCE_ERRORS;

export async function resolveSources(
  workspace: Workspace
): Promise<ResolvedSource[]> {
  const sourcePromises: Promise<ResolvedSource>[] = [];
  const workspaceRoot = await realpath(workspace.root);

  workspace.sources.forEach((source) => {
    sourcePromises.push(resolveSource(workspaceRoot, source));
  });

  return Promise.all(sourcePromises);
}

async function resolveSource(
  workspaceRoot: string,
  source: ConfiguredSource
): Promise<ResolvedSource> {
  const configuredPath = resolve(workspaceRoot, source.path);
  const sourceRoot = await realpath(configuredPath);
  const sourceStats = await stat(sourceRoot);

  if (!sourceStats.isDirectory()) {
    throw new Error(sourceMustBeDirError(source.id, sourceRoot));
  }

  if (
    source.origin === "shared" &&
    !isPathInside(workspaceRoot, sourceRoot)
  ) {
    throw new Error(sharedSourceOutsideWorkspaceError(source.id, sourceRoot));
  }

  return {
    ...source,
    sourceRoot,
  };
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}
