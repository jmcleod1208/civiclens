import { boarddocsScraper, type DistrictConfig } from './scrapers/boarddocs.js'

const testDistricts: DistrictConfig[] = [
  { state: 'oh', districtSlug: 'Dublin', jurisdictionName: 'Dublin City School District, OH' },
  { state: 'ca', districtSlug: 'SDUSD', jurisdictionName: 'San Diego Unified School District, CA' },
  { state: 'ut', districtSlug: 'dsdut', jurisdictionName: 'Davis School District, UT' },
]

async function main() {
  for (const district of testDistricts) {
    const key = `${district.state}/${district.districtSlug}`
    console.log(`\n━━━━━━━━━━━━━━━━━━━━ ${key} (${district.jurisdictionName}) ━━━━━━━━━━━━━━━━━━━━`)

    try {
      const { session, meetings } = await boarddocsScraper.fetchMeetings(district)
      console.log(`Fetched ${meetings.length} meetings`)
      if (meetings[0]) console.log('Sample meeting:', JSON.stringify(meetings[0], null, 2))

      const parsed = await boarddocsScraper.parse(district, session, meetings.slice(0, 2))
      const totalItems = parsed.reduce((acc, p) => acc + p.items.length, 0)
      console.log(`Parsed ${parsed.length} meetings → ${totalItems} agenda items`)
      if (parsed[0]?.items[0]) {
        console.log('Sample agenda item:', JSON.stringify(parsed[0].items[0], null, 2))
      }

      const normalized = boarddocsScraper.normalize(parsed)
      console.log(`Normalized into ${normalized.length} CivicDocuments`)
      if (normalized[0]) console.log('Sample document:', JSON.stringify(normalized[0], null, 2))

      console.log(`Upserting ${normalized.length} documents to database...`)
      const result = await boarddocsScraper.upsertAll(normalized)
      console.log(
        `Result: created=${result.created} updated=${result.updated} errors=${result.errors}`,
      )
    } catch (err) {
      console.error(`[${key}] FAILED:`, (err as Error).message)
    }
  }

  console.log('\nDone. Check your database.')
}

main().catch(console.error)
