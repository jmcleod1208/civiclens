import { congressScraper } from './scrapers/congress.js'

async function main() {
  console.log('Fetching first page of bills from Congress.gov...')
  const raw = await congressScraper.fetch()
  console.log(`Fetched ${raw.length} raw bills`)

  const parsed = await congressScraper.parse(raw)
  console.log(`Parsed ${parsed.length} documents`)
  console.log('Sample document:', JSON.stringify(parsed[0], null, 2))

  const normalized = congressScraper.normalize(parsed)
  console.log('Normalized sample:', JSON.stringify(normalized[0], null, 2))

  console.log('Upserting to database...')
  await congressScraper.upsertAll(normalized)
  console.log('Done. Check your database.')
}

main().catch(console.error)
