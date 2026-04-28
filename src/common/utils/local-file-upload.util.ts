// utils/local-file-upload.ts
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function uploadBufferFileToLocal(
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'application/octet-stream'
): Promise<string> {
  // Use project root so path is stable between src/ and dist/
  const uploadDir = join(process.cwd(), 'public', 'uploads');
  const filePath = join(uploadDir, fileName);

  // Ensure directory exists
  await mkdir(uploadDir, { recursive: true });

  // Write file
  await writeFile(filePath, buffer);

  // return either filename or full path; choose as per your code
  return fileName;
}
