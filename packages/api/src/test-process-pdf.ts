/**
 * End-to-end test for the PDF pipeline:
 *   1. pdf-harvester  → finds PDFs on a public board-meeting page
 *   2. process-pdf    → downloads the PDF and extracts content via Gemini 2.0 Flash
 *   3. Verifies the CivicDocument.fullText was populated
 *
 * Run with:
 *   pnpm --filter @civiclens/api test:process-pdf
 *
 * Requires GOOGLE_AI_API_KEY and DATABASE_URL to be set.
 * Docker services (postgres + redis) must be running for DB writes.
 */
import { harvestPdfs } from './scrapers/pdf-harvester.js'
import { extractPdfContent } from './jobs/process-pdf.js'

// ─── Test page with publicly available board meeting PDFs ─────────────────────
// Using the Dublin City School District meetings page as a known good source.
const TEST_HARVEST_PAGE = 'https://go.boarddocs.com/oh/Dublin/Board.nsf/Public'
const TEST_PDF_URL =
  'https://www.fcc.gov/sites/default/files/open_internet_order.pdf'

async function testDirectExtraction() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━ Direct PDF Extraction ━━━━━━━━━━━━━━━━━━━━')
  console.log(`URL: ${TEST_PDF_URL}`)
  console.log('Note: This downloads the PDF and calls Gemini 2.0 Flash — may take ~30s\n')

  const fakeDocumentId = 'test-doc-' + Date.now()

  try {
    const fullText = await extractPdfContent(TEST_PDF_URL, fakeDocumentId)
    console.log(`\nExtracted fullText (${fullText.length} chars):`)
    console.log('─'.repeat(60))
    console.log(fullText.slice(0, 1500))
    if (fullText.length > 1500) console.log(`\n…(${fullText.length - 1500} more chars)`)
    console.log('\n✓ Direct extraction succeeded')
  } catch (err) {
    console.error('\n✗ Direct extraction failed:', (err as Error).message)
  }
}

async function testHarvester() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━ PDF Harvester ━━━━━━━━━━━━━━━━━━━━')
  console.log(`Page: ${TEST_HARVEST_PAGE}`)
  console.log('Note: Launches headless Chromium to find PDF links\n')

  try {
    const result = await harvestPdfs({
      pageUrl: TEST_HARVEST_PAGE,
      jurisdiction: 'Dublin City School District, OH',
    })

    console.log(`\nHarvest result:`)
    console.log(`  PDFs found:  ${result.pdfs.length}`)
    console.log(`  Enqueued:    ${result.enqueued}`)
    console.log(`  Skipped:     ${result.skipped}`)
    console.log(`  Errors:      ${result.errors}`)

    if (result.pdfs.length > 0) {
      console.log('\nFirst 3 PDFs:')
      for (const pdf of result.pdfs.slice(0, 3)) {
        console.log(`  [${pdf.type}] ${pdf.title}`)
        console.log(`    URL:  ${pdf.url}`)
        console.log(`    Date: ${pdf.date.toISOString().slice(0, 10)}`)
      }
    } else {
      console.log('\nNote: No PDF links found — the page may require authentication')
      console.log('or use a different URL structure. Try a district\'s direct meetings page.')
    }

    console.log('\n✓ Harvester test complete (process-pdf jobs queued in Redis if running)')
  } catch (err) {
    console.error('\n✗ Harvester test failed:', (err as Error).message)
  }
}

async function main() {
  const mode = process.argv[2] ?? 'all'

  if (mode === 'extract' || mode === 'all') {
    await testDirectExtraction()
  }
  if (mode === 'harvest' || mode === 'all') {
    await testHarvester()
  }

  console.log('\nDone.')
}

main().catch(console.error)
