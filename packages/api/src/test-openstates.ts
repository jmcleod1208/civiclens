import { openstatesScraper } from './scrapers/openstates.js'

const STATE = process.argv[2] ?? 'ca'

async function main() {
  console.log(`Fetching first page of bills from OpenStates for state=${STATE}...`)
  const raw = await openstatesScraper.fetch(STATE)
  console.log(`Fetched ${raw.length} raw bills`)

  const parsed = await openstatesScraper.parse(raw)
  console.log(`Parsed ${parsed.length} documents`)
  console.log('Sample document:', JSON.stringify(parsed[0], null, 2))

  const normalized = openstatesScraper.normalize(STATE, parsed)
  console.log('Normalized sample:', JSON.stringify(normalized[0], null, 2))

  console.log('Upserting to database...')
  await openstatesScraper.upsertAll(STATE, normalized)
  console.log('Done. Check your database.')
}

main().catch(console.error)
