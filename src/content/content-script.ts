import { extractPage } from '../lib/extract'
import type { PageContent } from '../lib/types'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'EXTRACT_PAGE') return

  try {
    const data: PageContent = extractPage(document)
    sendResponse({ ok: true, data })
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Extraction impossible'
    sendResponse({ ok: false, error: messageText })
  }
})
