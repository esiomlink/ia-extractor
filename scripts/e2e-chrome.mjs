import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const demoHtml = readFileSync(join(root, 'demo/annuaire-b2b.html'))
const extensionId = 'nolbmbaeocmhhbodopbckkcinejimaee'

const executablePath = [
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path) => existsSync(path))

if (!executablePath) {
  throw new Error('Chrome / Chromium introuvable')
}

async function serveDemo() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(demoHtml)
  })
  await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve))
  return server
}

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  pipe: true,
  enableExtensions: true,
  args: [
    `--user-data-dir=${join(root, '.chrome-e2e')}`,
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run',
    '--no-default-browser-check',
  ],
})

const server = await serveDemo()
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4173/annuaire-b2b.html', { waitUntil: 'domcontentloaded' })

  const targets = await browser.targets()
  console.log(
    'targets',
    targets.map((target) => `${target.type()} ${target.url()}`),
  )

  let workerTarget = targets.find(
    (target) => target.type() === 'service_worker' && target.url().includes('chrome-extension://'),
  )
  if (!workerTarget) {
    workerTarget = await browser.waitForTarget(
      (target) => target.type() === 'service_worker' && target.url().includes('chrome-extension://'),
      { timeout: 8_000 },
    )
  }
  const session = await workerTarget.createCDPSession()
  await session.send('Runtime.enable')
  const evaluated = await session.send('Runtime.evaluate', {
    expression: `Promise.resolve().then(async () => {
      const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:4173/*' });
      const tabId = tabs[0] && tabs[0].id;
      if (typeof globalThis.__extractCurrentTab !== 'function') {
        return { ok: false, error: 'extractCurrentTab absent', keys: Object.keys(globalThis).slice(0, 20) };
      }
      return globalThis.__extractCurrentTab(tabId);
    })`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (evaluated.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.text || 'Runtime.evaluate a échoué')
  }
  const result = evaluated.result.value


  console.log(JSON.stringify(result, null, 2))
  if (!result?.ok) throw new Error(result?.error ?? 'Extraction Chrome échouée')
  if (!result.leads?.length) throw new Error('Aucun lead retourné')

  const popup = await browser.newPage()
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`, {
    waitUntil: 'networkidle0',
    timeout: 15_000,
  })
  const text = await popup.evaluate(() => document.body.innerText)
  console.log('--- POPUP ---')
  console.log(text.slice(0, 800))
  if (!/Smart Extractor/i.test(text)) throw new Error('Popup non rendu')
  await popup.setViewport({ width: 400, height: 640 })
  await popup.screenshot({ path: join(root, 'demo/popup-e2e.png') })
  console.log('E2E Chrome OK')
} finally {
  await browser.close()
  server.close()
}
