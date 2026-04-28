export function generateSeoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/gi, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '-');    // Replace spaces with underscores
}