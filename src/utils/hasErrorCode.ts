import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
});

export function hasErrorCode(error: unknown, code: string): boolean | Error {
  const parsedError = errorSchema.safeParse(error);

  if (!parsedError.success) {
    return new Error("hasErrorCode: unable to parse error");
  }

  return parsedError.data.code === code;
}
