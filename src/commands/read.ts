import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import { extractMarkdownSection } from "../indexer.js";
import { resolveSources } from "../sources.js";
import type { ResolvedSource } from "../types/source.types.js";
import { loadWorkspace } from "../workspace.js";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_OUTPUT_CHARACTERS = 64 * 1024;
const PROTECTED_DIRECTORY_NAMES = new Set([".diana", ".git"]);

export const COMMAND_READ_ERRORS = {
  emptyPathError: "Read path must not be empty.",
  fileTooLargeError: (filePath: string) =>
    `Source file exceeds the ${MAX_FILE_BYTES}-byte read limit: ${filePath}.`,
  invalidPathError: (filePath: string) =>
    `Path is not a readable Markdown file in a configured source: ${filePath}.`,
  sectionNotFoundError: (anchor: string) => `Section not found: ${anchor}.`,
} as const;

const {
  emptyPathError,
  fileTooLargeError,
  invalidPathError,
  sectionNotFoundError,
} = COMMAND_READ_ERRORS;

export type ReadResult = {
  content: string;
  path: string;
  sourceRoot: string;
  truncated: boolean;
};

export async function readWorkspace(
  workspaceRoot: string,
  requestedPath: string,
  section?: string
): Promise<ReadResult> {
  if (requestedPath.trim() === "") {
    throw new Error(emptyPathError);
  }

  const workspace = await loadWorkspace(workspaceRoot);
  const configuredPath = resolve(workspace.root, requestedPath);
  const filePath = await realpath(configuredPath);
  const source = findContainingSource(
    filePath,
    await resolveSources(workspace)
  );

  if (source === undefined || !isReadableSourceFile(filePath, source)) {
    throw new Error(invalidPathError(configuredPath));
  }

  const fileStats = await stat(filePath);

  if (!fileStats.isFile()) {
    throw new Error(invalidPathError(configuredPath));
  }

  if (fileStats.size > MAX_FILE_BYTES) {
    throw new Error(fileTooLargeError(filePath));
  }

  const markdown = await readFile(filePath, "utf8");
  const content =
    section === undefined ? markdown : readSection(markdown, section);

  return {
    content: content.slice(0, MAX_OUTPUT_CHARACTERS),
    path: toDocumentPath(source.sourceRoot, filePath),
    sourceRoot: source.sourceRoot,
    truncated: content.length > MAX_OUTPUT_CHARACTERS,
  };
}

function readSection(markdown: string, section: string): string {
  const content = extractMarkdownSection(markdown, section);

  if (content === undefined) {
    throw new Error(sectionNotFoundError(section));
  }

  return content;
}

function findContainingSource(
  filePath: string,
  sources: ResolvedSource[]
): ResolvedSource | undefined {
  return sources.find((source) => isPathInside(source.sourceRoot, filePath));
}

function isReadableSourceFile(
  filePath: string,
  source: ResolvedSource
): boolean {
  const documentPath = toDocumentPath(source.sourceRoot, filePath);
  const pathSegments = documentPath.split("/");

  return (
    filePath.endsWith(".md") &&
    !pathSegments.some(isProtectedOrHidden) &&
    source.include.some((pattern) =>
      posix.matchesGlob(documentPath, pattern)
    ) &&
    !source.exclude.some((pattern) => posix.matchesGlob(documentPath, pattern))
  );
}

function isProtectedOrHidden(pathSegment: string): boolean {
  return (
    pathSegment.startsWith(".") || PROTECTED_DIRECTORY_NAMES.has(pathSegment)
  );
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

function toDocumentPath(sourceRoot: string, filePath: string): string {
  return relative(sourceRoot, filePath).split(sep).join("/");
}
