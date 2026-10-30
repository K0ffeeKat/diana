#!/usr/bin/env node

import { initializeWorkspace } from "./commands/init.js";
import { indexWorkspace } from "./commands/index.js";
import { readWorkspace } from "./commands/read.js";
import { searchWorkspace } from "./commands/search.js";

const [command, ...arguments_] = process.argv.slice(2);

const USAGE_HINT = `\nUsage:
diana <command>

Commands:
  init
  setup
  index
  search <query...>
  read <path> [--section <anchor>]

`;

const USAGE_ERROR = `\nUnknown command: ${command}\nRun "diana --help" for usage.\n`;

switch (command) {
  case undefined:
  case "--help":
  case "-h":
    process.stdout.write(USAGE_HINT);
    break;
  case "init":
    await initializeWorkspace(process.cwd());
    break;
  case "index":
    await indexWorkspace(process.cwd());
    break;
  case "search": {
    const results = await searchWorkspace(process.cwd(), arguments_.join(" "));
    process.stdout.write(`${JSON.stringify(results)}\n`);
    break;
  }
  case "read": {
    const { path, section } = parseReadArguments(arguments_);
    const result = await readWorkspace(process.cwd(), path, section);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    break;
  }
  default:
    process.stderr.write(USAGE_ERROR);
    process.exitCode = 1;
}

function parseReadArguments(arguments_: string[]): {
  path: string;
  section?: string;
} {
  const [path, ...options] = arguments_;

  if (path === undefined) {
    throw new Error("Read path must not be empty.");
  }

  if (options.length === 0) {
    return { path };
  }

  const section = options[1];

  if (
    options.length === 2 &&
    options[0] === "--section" &&
    section !== undefined &&
    section !== ""
  ) {
    return { path, section };
  }

  throw new Error("Usage: diana read <path> [--section <anchor>].");
}
