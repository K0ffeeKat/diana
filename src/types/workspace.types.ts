import { z } from "zod";

export const sourceSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
});

export const configSchema = z.object({
  version: z.literal(1),
  sources: z.array(sourceSchema),
});

export type DianaSource = z.infer<typeof sourceSchema>;
export type DianaConfig = z.infer<typeof configSchema>;

export type SourceOrigin = "shared" | "local";
export type ConfiguredSource = DianaSource & { origin: SourceOrigin };
export type Workspace = {
  root: string;
  configPath: string;
  sources: ConfiguredSource[];
};
