import {
  boarddocsScraper,
  loadDistricts,
  registerDistrict,
  type DistrictConfig,
} from './scrapers/boarddocs.js'

// ─── Test districts ───────────────────────────────────────────────────────────

const testDistricts: DistrictConfig[] = [
  { state: 'oh', districtSlug: 'Dublin', jurisdictionName: 'Dublin City School District, OH' },
  { state: 'ca', districtSlug: 'SDUSD', jurisdictionName: 'San Diego Unified School District, CA' },
  { state: 'ut', districtSlug: 'dsdut', jurisdictionName: 'Davis School District, UT' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function separator(label: string) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━ ${label} ━━━━━━━━━━━━━━━━━━━━`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Step 1: Register districts ───────────────────────────────────────────
  separator('Registering districts in DB')
  for (const d of testDistricts) {
    try {
      await registerDistrict(d)
    } catch (err) {
      // DB may not be running; warn and continue with the scrape test below.
      console.warn(`  [warn] registerDistrict failed (DB down?): ${(err as Error).message}`)
    }
  }

  // ── Step 2: Load districts from DB ───────────────────────────────────────
  separator('Loading districts from DB')
  let dbDistricts: DistrictConfig[] = []
  try {
    dbDistricts = await loadDistricts()
    console.log(`Loaded ${dbDistricts.length} district(s) from SchoolDistrict table:`)
    for (const d of dbDistricts) console.log(`  ${d.state}/${d.districtSlug} — ${d.jurisdictionName}`)
  } catch (err) {
    console.warn(`  [warn] loadDistricts failed (DB down?): ${(err as Error).message}`)
    console.log('  Falling back to hardcoded testDistricts for the scrape test.')
    dbDistricts = testDistricts
  }

  // ── Step 3: Scrape each district ─────────────────────────────────────────
  for (const district of dbDistricts.slice(0, testDistricts.length)) {
    const key = `${district.state}/${district.districtSlug}`
    separator(`${key} — ${district.jurisdictionName}`)

    try {
      // Fetch meetings
      const { session, meetings } = await boarddocsScraper.fetchMeetings(district)
      console.log(`Fetched ${meetings.length} meetings`)
      if (meetings[0]) console.log('Sample meeting:', JSON.stringify(meetings[0], null, 2))

      // Parse agenda + minutes for the two most recent meetings
      const parsed = await boarddocsScraper.parse(district, session, meetings.slice(0, 2))
      const totalItems = parsed.reduce((acc, p) => acc + p.items.length, 0)
      const withMinutes = parsed.filter(p => p.minutesHtml !== null).length
      console.log(
        `Parsed ${parsed.length} meetings → ${totalItems} agenda items, ` +
          `${withMinutes} with separate minutes document`,
      )
      if (parsed[0]?.items[0]) {
        console.log('Sample agenda item:', JSON.stringify(parsed[0].items[0], null, 2))
      }
      if (parsed[0]?.minutesHtml) {
        console.log(
          'Minutes HTML (first 200 chars):',
          parsed[0].minutesHtml.slice(0, 200).replace(/\s+/g, ' '),
        )
      }

      // Normalize
      const normalized = boarddocsScraper.normalize(parsed)
      const agendaDocs = normalized.filter(d => d.type === 'agenda').length
      const minutesDocs = normalized.filter(d => d.type === 'minutes').length
      const itemDocs = normalized.filter(d => !['agenda', 'minutes'].includes(d.type)).length
      console.log(
        `Normalized into ${normalized.length} CivicDocuments ` +
          `(agenda=${agendaDocs}, minutes=${minutesDocs}, items=${itemDocs})`,
      )
      if (normalized[0]) console.log('Sample document:', JSON.stringify(normalized[0], null, 2))

      // Upsert
      console.log(`Upserting ${normalized.length} documents to database...`)
      const result = await boarddocsScraper.upsertAll(normalized, district)
      console.log(
        `Result: created=${result.created} updated=${result.updated} errors=${result.errors}`,
      )
    } catch (err) {
      console.error(`[${key}] FAILED:`, (err as Error).message)
    }
  }

  console.log('\nDone. Check your database for new records in CivicDocument and SchoolDistrict.')
}

main().catch(console.error)
