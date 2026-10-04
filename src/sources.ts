import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ConfiguredSource, Workspace } from "./types/workspace.types.js";
import type { ResolvedSource } from "./types/source.types.js";
import { hasErrorCode } from "./utils/hasErrorCode.js";

export const SOURCE_ERRORS = {
  sourceDoesNotExistError: (configuredPath: string) =>
    `Source does not exist: ${configuredPath}.`,
  sourceMustBeDirError: (sourceRoot: string) =>
    `Source must be a directory: ${sourceRoot}.`,
  sharedSourceOutsideWorkspaceError: (sourceRoot: string) =>
    `Shared source must be inside the workspace: ${sourceRoot}.`,
} as const;

const {
  sourceDoesNotExistError,
  sourceMustBeDirError,
  sharedSourceOutsideWorkspaceError,
} = SOURCE_ERRORS;

export async function resolveSources(
  workspace: Workspace
): Promise<ResolvedSource[]> {
  const sourcePromises: Promise<ResolvedSource>[] = [];
  const workspaceRoot = await realpath(workspace.root);

  workspace.sources.forEach((source) => {
    sourcePromises.push(resolveSource(workspaceRoot, source));
  });

  const resolvedSources = await Promise.all(sourcePromises);
  const sourceRoots = new Set<string>();
  const uniqueSources: ResolvedSource[] = [];

  resolvedSources.forEach((source) => {
    if (sourceRoots.has(source.sourceRoot)) {
      return;
    }

    sourceRoots.add(source.sourceRoot);
    uniqueSources.push(source);
  });

  return uniqueSources;
}

async function resolveSource(
  workspaceRoot: string,
  source: ConfiguredSource
): Promise<ResolvedSource> {
  const configuredPath = resolve(workspaceRoot, source.path);
  let sourceRoot: string;

  try {
    sourceRoot = await realpath(configuredPath);
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new Error(sourceDoesNotExistError(configuredPath));
    }

    throw error;
  }

  const sourceStats = await stat(sourceRoot);

  if (!sourceStats.isDirectory()) {
    throw new Error(sourceMustBeDirError(sourceRoot));
  }

  if (source.origin === "shared" && !isPathInside(workspaceRoot, sourceRoot)) {
    throw new Error(sharedSourceOutsideWorkspaceError(sourceRoot));
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
