import { promises as fs } from "fs";
import * as path from "path";

export async function deleteFileIfExists(filename?: string | null) {
  if (!filename) return;

  const filePath = path.join(process.cwd(), "public", "uploads", filename);

  try {
    await fs.unlink(filePath);
    // console.log(`Deleted file: ${filePath}`);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      console.error("Error deleting file:", err);
    }
  }
}
