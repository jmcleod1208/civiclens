import { Hono } from 'hono'
import type { AppEnv } from '../lib/types.js'

const jurisdictions = new Hono<AppEnv>()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JurisdictionResult {
  normalized_address: string | null
  federal_district: string | null   // e.g. "OH-12"
  state: string | null              // e.g. "OH"
  state_fips: string | null         // e.g. "39"
  state_district_upper: string | null  // state senate district
  state_district_lower: string | null  // state house district
  county: string | null
  county_fips: string | null
  city: string | null
  school_district: string | null
  school_district_fips: string | null
}

// State FIPS → abbreviation map
const FIPS_TO_STATE: Record<string, string> = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY','72':'PR',
}

// ─── Census Geocoder ──────────────────────────────────────────────────────────

/**
 * Calls the US Census Bureau Geocoder (free, no API key required).
 * Accepts either a full single-line address or structured components.
 * Returns FIPS codes and geography names for all matched political layers.
 */
async function geocodeWithCensus(address: string): Promise<JurisdictionResult> {
  const empty: JurisdictionResult = {
    normalized_address: null,
    federal_district: null,
    state: null,
    state_fips: null,
    state_district_upper: null,
    state_district_lower: null,
    county: null,
    county_fips: null,
    city: null,
    school_district: null,
    school_district_fips: null,
  }

  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress')
  url.searchParams.set('address', address)
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('vintage', 'Current_Current')
  url.searchParams.set('layers', 'all')
  url.searchParams.set('format', 'json')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`Census Geocoder returned HTTP ${res.status}`)
  }

  const body = await res.json() as any
  const match = body?.result?.addressMatches?.[0]
  if (!match) return empty

  const geo = match.geographies ?? {}
  const addr = match.matchedAddress as string | undefined

  // Layer names are year-prefixed (e.g. "119th Congressional Districts",
  // "2024 State Legislative Districts - Upper"). Find them by keyword match.
  function findLayer(keyword: string): any[] {
    const key = Object.keys(geo).find(k => k.toLowerCase().includes(keyword.toLowerCase()))
    return key ? (geo[key] ?? []) : []
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const stateGeo = (geo['States'] ?? [])[0]
  const stateFips = stateGeo?.GEOID ?? null
  const stateAbbr = stateFips ? (FIPS_TO_STATE[stateFips] ?? null) : null

  // ── Congressional district ─────────────────────────────────────────────────
  const cdGeo = findLayer('congressional')[0]
  const cdNum = cdGeo?.BASENAME ?? null
  const federalDistrict = stateAbbr && cdNum ? `${stateAbbr}-${cdNum}` : null

  // ── State legislative districts ────────────────────────────────────────────
  const upperGeo = findLayer('upper')[0]
  const lowerGeo = findLayer('lower')[0]
  const stateUpper = upperGeo?.BASENAME ?? null
  const stateLower = lowerGeo?.BASENAME ?? null

  // ── County ─────────────────────────────────────────────────────────────────
  const countyGeo = (geo['Counties'] ?? [])[0]
  const countyName = countyGeo?.NAME ?? null
  const countyFips = countyGeo?.GEOID ?? null

  // ── City / place ───────────────────────────────────────────────────────────
  const placeGeo =
    (geo['Incorporated Places'] ?? [])[0] ??
    findLayer('designated places')[0]
  const cityName = placeGeo?.NAME ?? null

  // ── School district ────────────────────────────────────────────────────────
  const schoolGeo =
    (geo['Unified School Districts'] ?? [])[0] ??
    findLayer('elementary school')[0] ??
    findLayer('secondary school')[0]
  const schoolName = schoolGeo?.NAME ?? null
  const schoolFips = schoolGeo?.GEOID ?? null

  return {
    normalized_address: addr ?? null,
    federal_district: federalDistrict,
    state: stateAbbr,
    state_fips: stateFips,
    state_district_upper: stateUpper ? `${stateAbbr}-SD-${stateUpper}` : null,
    state_district_lower: stateLower ? `${stateAbbr}-HD-${stateLower}` : null,
    county: countyName,
    county_fips: countyFips,
    city: cityName,
    school_district: schoolName,
    school_district_fips: schoolFips,
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/jurisdictions/lookup?address=<street+city+state+zip>
 *
 * Geocodes the address via the US Census Bureau Geocoder (free, no API key)
 * and returns the political jurisdictions that govern it.
 *
 * @example
 * GET /api/jurisdictions/lookup?address=5200+Emerald+Pkwy+Dublin+OH+43017
 *
 * Response:
 * {
 *   "normalized_address": "5200 EMERALD PKWY, DUBLIN, OH, 43017",
 *   "federal_district": "OH-12",
 *   "state": "OH",
 *   "state_fips": "39",
 *   "state_district_upper": "OH-SD-16",
 *   "state_district_lower": "OH-HD-21",
 *   "county": "Franklin County",
 *   "county_fips": "39049",
 *   "city": "Dublin city",
 *   "school_district": "Dublin City School District",
 *   "school_district_fips": "3904842"
 * }
 */
jurisdictions.get('/lookup', async c => {
  const address = c.req.query('address')?.trim()

  if (!address || address.length < 5) {
    return c.json({ error: 'address query parameter is required (e.g. ?address=123+Main+St+Columbus+OH)' }, 400)
  }

  try {
    const result = await geocodeWithCensus(address)

    if (!result.state && !result.county) {
      return c.json({ error: 'Address not found. Try including city and state (e.g. 123 Main St, Dublin, OH).' }, 404)
    }

    return c.json(result)
  } catch (err) {
    console.error('[GET /api/jurisdictions/lookup]', err)
    return c.json({ error: 'Failed to geocode address' }, 500)
  }
})

export default jurisdictions
