import * as puppeteer from 'puppeteer';

export async function generatePDF(htmlContent: string): Promise<Buffer> {
  // On aarch64 hosts, Chrome-for-Testing has no build so puppeteer's default
  // bundle is x86-64 and fails with ENOEXEC. Set PUPPETEER_EXECUTABLE_PATH
  // in the deploy environment to point at a system chromium (e.g.
  // /usr/lib64/chromium-browser/headless_shell on OL9 aarch64).
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    // Convert Uint8Array to Buffer if needed
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
