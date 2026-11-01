import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { updateIndex } from "../indexer.js";
import { resolveSources } from "../sources.js";
import { WORKSPACE_CONSTANTS, loadWorkspace } from "../workspace.js";
import { pathExists } from "../utils/pathExists.js";

const { databaseFileName, internalDirName } = WORKSPACE_CONSTANTS;

export const COMMAND_SEARCH_ERRORS = {
  emptyQueryError: "Search query must not be empty.",
  indexNotFoundError: "No index found. Run diana index first.",
} as const;

const { emptyQueryError, indexNotFoundError } = COMMAND_SEARCH_ERRORS;

export type SearchResult = {
  anchor: string;
  excerpt: string;
  heading: string;
  path: string;
  sourceRoot: string;
  title: string;
};

export async function searchWorkspace(
  workspaceRoot: string,
  query: string
): Promise<SearchResult[]> {
  if (query.trim() === "") {
    throw new Error(emptyQueryError);
  }

  const workspace = await loadWorkspace(workspaceRoot);
  const databasePath = join(workspace.root, internalDirName, databaseFileName);

  if (!(await pathExists(databasePath))) {
    throw new Error(indexNotFoundError);
  }

  await updateIndex(databasePath, await resolveSources(workspace), "auto");

  const database = new DatabaseSync(databasePath, { readOnly: true });

  try {
    return database
      .prepare(
        `
        SELECT
          source_root AS sourceRoot,
          path,
          title,
          heading,
          anchor,
          snippet(sections, 5, '', '', '…', 24) AS excerpt
        FROM sections
        WHERE sections MATCH ?
        ORDER BY bm25(sections)
        LIMIT 10
      `
      )
      .all(toFtsQuery(query)) as SearchResult[];
  } finally {
    database.close();
  }
}

function toFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" AND ");
}
