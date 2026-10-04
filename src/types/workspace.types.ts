import { z } from "zod";

export const sourceSchema = z.object({
  path: z.string(),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
});

export const configSchema = z.object({
  version: z.literal(1),
  sources: z.array(sourceSchema),
});

const workspaceSchema = z.object({
  root: z.string(),
  configPath: z.string(),
  config: configSchema,
});

export type DianaSource = z.infer<typeof sourceSchema>;
export type DianaConfig = z.infer<typeof configSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
