import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, posix, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ResolvedSource } from "./types/source.types.js";

const PROTECTED_DIRECTORY_NAMES = new Set([".diana", ".git"]);

export type IndexedSection = {
  anchor: string;
  body: string;
  heading: string;
  title: string;
};

export async function updateIndex(
  databasePath: string,
  sources: ResolvedSource[]
): Promise<void> {
  const database = new DatabaseSync(databasePath);

  try {
    createSchema(database);
    database.exec("BEGIN IMMEDIATE");

    try {
      await removeUnconfiguredSources(database, sources);

      for (const source of sources) {
        await indexSource(database, source);
      }

      database.exec("COMMIT");
    } catch (error: unknown) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export async function findMarkdownFiles(
  source: ResolvedSource
): Promise<string[]> {
  const markdownFiles: string[] = [];

  await visitDirectory(source.sourceRoot, source, markdownFiles);

  return markdownFiles;
}

export function extractMarkdownSection(
  markdown: string,
  requestedAnchor: string
): string | undefined {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const anchorCounts = new Map<string, number>();
  let sectionStart: number | undefined;
  let sectionAnchor: string | undefined;

  for (const [lineIndex, line] of lines.entries()) {
    const heading = parseHeading(line);

    if (heading === undefined) {
      continue;
    }

    if (sectionAnchor === requestedAnchor && sectionStart !== undefined) {
      return lines.slice(sectionStart, lineIndex).join("\n");
    }

    sectionStart = lineIndex;
    sectionAnchor = createAnchor(heading, anchorCounts);
  }

  if (sectionAnchor === requestedAnchor && sectionStart !== undefined) {
    return lines.slice(sectionStart).join("\n");
  }

  return undefined;
}

export function splitMarkdownIntoSections(
  markdown: string,
  filePath: string
): IndexedSection[] {
  const title = findTitle(markdown, filePath);
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sections: IndexedSection[] = [];
  const anchorCounts = new Map<string, number>();
  let currentHeading: string | undefined;
  let currentAnchor: string | undefined;
  let currentBody: string[] = [];

  for (const line of lines) {
    const heading = parseHeading(line);

    if (heading === undefined) {
      currentBody.push(line);
      continue;
    }

    if (currentHeading === undefined || currentAnchor === undefined) {
      currentHeading = heading;
      currentAnchor = createAnchor(heading, anchorCounts);
      continue;
    }

    addSection(sections, title, currentHeading, currentAnchor, currentBody);
    currentHeading = heading;
    currentAnchor = createAnchor(heading, anchorCounts);
    currentBody = [];
  }

  if (currentHeading === undefined || currentAnchor === undefined) {
    addSection(
      sections,
      title,
      title,
      createAnchor(title, anchorCounts),
      currentBody
    );
  } else {
    addSection(sections, title, currentHeading, currentAnchor, currentBody);
  }

  return sections;
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      source_root TEXT NOT NULL,
      path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      PRIMARY KEY (source_root, path)
    ) STRICT;

    CREATE VIRTUAL TABLE IF NOT EXISTS sections USING fts5(
      source_root UNINDEXED,
      path UNINDEXED,
      title,
      heading,
      anchor UNINDEXED,
      body,
      tokenize = 'unicode61'
    );
  `);
}

async function indexSource(
  database: DatabaseSync,
  source: ResolvedSource
): Promise<void> {
  const markdownFiles = await findMarkdownFiles(source);
  const currentPaths = new Set<string>();

  for (const filePath of markdownFiles) {
    const documentPath = toDocumentPath(source.sourceRoot, filePath);
    currentPaths.add(documentPath);

    const markdown = await readFile(filePath, "utf8");
    const sha256 = createHash("sha256").update(markdown).digest("hex");
    const existingDocument = database
      .prepare(
        "SELECT sha256 FROM documents WHERE source_root = ? AND path = ?"
      )
      .get(source.sourceRoot, documentPath) as { sha256: string } | undefined;

    if (existingDocument?.sha256 === sha256) {
      continue;
    }

    deleteDocument(database, source.sourceRoot, documentPath);

    database
      .prepare(
        "INSERT INTO documents (source_root, path, sha256) VALUES (?, ?, ?)"
      )
      .run(source.sourceRoot, documentPath, sha256);

    const insertSection = database.prepare(`
      INSERT INTO sections (source_root, path, title, heading, anchor, body)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const section of splitMarkdownIntoSections(markdown, documentPath)) {
      insertSection.run(
        source.sourceRoot,
        documentPath,
        section.title,
        section.heading,
        section.anchor,
        section.body
      );
    }
  }

  const indexedDocuments = database
    .prepare("SELECT path FROM documents WHERE source_root = ?")
    .all(source.sourceRoot) as { path: string }[];

  for (const document of indexedDocuments) {
    if (!currentPaths.has(document.path)) {
      deleteDocument(database, source.sourceRoot, document.path);
    }
  }
}

async function removeUnconfiguredSources(
  database: DatabaseSync,
  sources: ResolvedSource[]
): Promise<void> {
  const activeSourceRoots = new Set(sources.map((source) => source.sourceRoot));
  const indexedSources = database
    .prepare("SELECT DISTINCT source_root FROM documents")
    .all() as { source_root: string }[];

  for (const indexedSource of indexedSources) {
    if (activeSourceRoots.has(indexedSource.source_root)) {
      continue;
    }

    database
      .prepare("DELETE FROM sections WHERE source_root = ?")
      .run(indexedSource.source_root);
    database
      .prepare("DELETE FROM documents WHERE source_root = ?")
      .run(indexedSource.source_root);
  }
}

function deleteDocument(
  database: DatabaseSync,
  sourceRoot: string,
  documentPath: string
): void {
  database
    .prepare("DELETE FROM sections WHERE source_root = ? AND path = ?")
    .run(sourceRoot, documentPath);
  database
    .prepare("DELETE FROM documents WHERE source_root = ? AND path = ?")
    .run(sourceRoot, documentPath);
}

async function visitDirectory(
  directoryPath: string,
  source: ResolvedSource,
  markdownFiles: string[]
): Promise<void> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink() || isProtectedOrHidden(entry.name)) {
      continue;
    }

    const entryPath = `${directoryPath}${sep}${entry.name}`;

    if (entry.isDirectory()) {
      await visitDirectory(entryPath, source, markdownFiles);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      matchesSourcePatterns(
        toDocumentPath(source.sourceRoot, entryPath),
        source
      )
    ) {
      markdownFiles.push(entryPath);
    }
  }
}

function matchesSourcePatterns(
  documentPath: string,
  source: ResolvedSource
): boolean {
  return (
    source.include.some((pattern) =>
      posix.matchesGlob(documentPath, pattern)
    ) &&
    !source.exclude.some((pattern) => posix.matchesGlob(documentPath, pattern))
  );
}

function isProtectedOrHidden(name: string): boolean {
  return name.startsWith(".") || PROTECTED_DIRECTORY_NAMES.has(name);
}

function toDocumentPath(sourceRoot: string, filePath: string): string {
  return relative(sourceRoot, filePath).split(sep).join("/");
}

function findTitle(markdown: string, filePath: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const heading = parseHeading(line);

    if (heading !== undefined) {
      return heading;
    }
  }

  return basename(filePath, ".md");
}

function parseHeading(line: string): string | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

  return match?.[2];
}

function createAnchor(
  heading: string,
  anchorCounts: Map<string, number>
): string {
  const baseAnchor = heading
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
  const count = anchorCounts.get(baseAnchor) ?? 0;

  anchorCounts.set(baseAnchor, count + 1);

  return count === 0 ? baseAnchor : `${baseAnchor}-${count}`;
}

function addSection(
  sections: IndexedSection[],
  title: string,
  heading: string,
  anchor: string,
  lines: string[]
): void {
  const body = lines.join("\n").trim();

  if (body === "" && sections.length > 0) {
    return;
  }

  sections.push({ anchor, body, heading, title });
}
