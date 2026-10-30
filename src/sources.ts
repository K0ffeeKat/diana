import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, posix, relative, resolve, sep } from "node:path";
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
  protectedSourceRootError: (sourceRoot: string) =>
    `Source root cannot be .git or .diana: ${sourceRoot}.`,
  overlappingSourceRootsError: (firstRoot: string, secondRoot: string) =>
    `Source roots overlap: ${firstRoot} and ${secondRoot}.`,
  invalidGlobPatternError: (pattern: string) =>
    `Invalid source glob pattern: ${pattern}.`,
} as const;

const {
  sourceDoesNotExistError,
  sourceMustBeDirError,
  sharedSourceOutsideWorkspaceError,
  protectedSourceRootError,
  overlappingSourceRootsError,
  invalidGlobPatternError,
} = SOURCE_ERRORS;

export async function resolveSources(
  workspace: Workspace
): Promise<ResolvedSource[]> {
  const sourcePromises: Promise<ResolvedSource>[] = [];
  const workspaceRoot = await realpath(workspace.root);

  workspace.sources.forEach((source) => {
    validatePatterns(source.include);
    validatePatterns(source.exclude);
    sourcePromises.push(resolveSource(workspaceRoot, source));
  });

  const resolvedSources = await Promise.all(sourcePromises);
  const sourceRoots = new Set<string>();
  const uniqueSources: ResolvedSource[] = [];

  resolvedSources.forEach((source) => {
    if (sourceRoots.has(source.sourceRoot)) {
      return;
    }

    const overlappingSource = uniqueSources.find(
      (existingSource) =>
        isPathInside(existingSource.sourceRoot, source.sourceRoot) ||
        isPathInside(source.sourceRoot, existingSource.sourceRoot)
    );

    if (overlappingSource !== undefined) {
      throw new Error(
        overlappingSourceRootsError(
          overlappingSource.sourceRoot,
          source.sourceRoot
        )
      );
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

  if ([".diana", ".git"].includes(basename(sourceRoot))) {
    throw new Error(protectedSourceRootError(sourceRoot));
  }

  if (source.origin === "shared" && !isPathInside(workspaceRoot, sourceRoot)) {
    throw new Error(sharedSourceOutsideWorkspaceError(sourceRoot));
  }

  return {
    ...source,
    sourceRoot,
  };
}

function validatePatterns(patterns: string[]): void {
  for (const pattern of patterns) {
    if (pattern.includes("\0")) {
      throw new Error(invalidGlobPatternError(pattern));
    }

    try {
      posix.matchesGlob("", pattern);
    } catch {
      throw new Error(invalidGlobPatternError(pattern));
    }
  }
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
