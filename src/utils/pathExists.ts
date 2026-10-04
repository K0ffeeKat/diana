import { lstat } from "node:fs/promises";
import { hasErrorCode } from "./hasErrorCode.js";

export async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e: unknown) {
    if (hasErrorCode(e, "ENOENT")) {
      return false;
    }

    throw e;
  }
}
