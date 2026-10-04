#!/usr/bin/env node

const [command] = process.argv.slice(2);

const USAGE_HINT = `\nUsage:
diana <command>

Commands:
  init [--source <path>]
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
  default:
    process.stderr.write(USAGE_ERROR);
    process.exitCode = 1;
}
