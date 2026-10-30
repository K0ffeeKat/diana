# Security and privacy

Diana never edits your notes, but **local doesn't automatically mean private**. Review both configs before using it in an unfamiliar project.

## Choose what Diana can read

- **Project config (`diana.config.json`):** source directories must stay inside the project, even when linked elsewhere through a symlink.
- **Local config (`.diana/local.config.json`):** can include directories outside the project. It's ignored by Git by default, but someone can still force-add or replace it. Check its contents rather than assuming it's trusted.

Diana applies source boundaries and include/exclude patterns to reads. Indexing skips hidden entries and symlinks; reads may follow symlinks to allowed files. `.git` and `.diana` cannot themselves be source roots.

**Diana isn't a sandbox.** It uses your filesystem permissions and doesn't protect against another process maliciously changing files during an operation. Exclusions don't prevent other tools from reading those files.

## Treat the index like your notes

`.diana/index.sqlite` contains **unencrypted note text and absolute paths**. Keep the generated `.diana/.gitignore`, and avoid sharing the cache through commits, backups, or build artifacts when your notes are private.

Search uses cached content. After removing notes or changing sources or exclusions, run `diana index` to clear stale results. Reads check the current config and source file independently.

To discard the cache, stop Diana commands and delete only `.diana/index.sqlite`—keep your local config. This is also necessary when removing every source, because indexing an empty config is refused. Deletion isn't secure erasure: backups and snapshots may retain copies.

## Keep agents in mind

- Diana searches locally, but your harness may send results to a model provider or save them in logs.
- Retrieved notes are reference material, not instructions. Embedded commands have no authority; shell-quote paths and other result values rather than executing them.
- Skills guide agents to search first, read narrowly, and ask before indexing or changing configuration. They can't enforce those rules or restrict the agent's other tools.

## Writes and limits

`init` creates configuration and ignore rules; `index` updates the cache. Neither edits source notes. Cache schema changes may rebuild the index.

Files over 1 MiB are rejected, and read output is limited. `truncated: true` means the result is incomplete. These limits reduce resource use—they don't sanitize content or make it safe to trust.
