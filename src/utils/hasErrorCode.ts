import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
});

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
