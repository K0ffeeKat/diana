import type { ConfiguredSource } from "./workspace.types.js";

export type ResolvedSource = ConfiguredSource & {
  sourceRoot: string;
};
