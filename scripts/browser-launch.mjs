// Use the installed Playwright browser, or an explicitly supplied local Chromium.
export async function launchBrowser() {
  const { chromium } = await import('playwright');
  const executablePath = process.env.SKILLER_CHROMIUM_EXECUTABLE;
  return chromium.launch(executablePath ? {
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
  } : {});
}
