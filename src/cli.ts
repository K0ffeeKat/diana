#!/usr/bin/env node

import { initializeWorkspace } from "./commands/init.js";
import { indexWorkspace } from "./commands/index.js";
import { searchWorkspace } from "./commands/search.js";

const [command, ...arguments_] = process.argv.slice(2);

const USAGE_HINT = `\nUsage:
diana <command>

Commands:
  init
  setup
  index
  search <query...>
  read <path>

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
  default:
    process.stderr.write(USAGE_ERROR);
    process.exitCode = 1;
}
