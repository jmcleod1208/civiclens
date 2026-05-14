import { Hono } from 'hono'
import type { AppEnv } from '../lib/types.js'

const jurisdictions = new Hono<AppEnv>()

// ─── Types ────────────────────────────────────────────────────────────────────

interface JurisdictionResult {
  federal_district: string | null   // e.g. "OH-12"
  state: string | null              // e.g. "OH"
  state_district: string | null     // e.g. "OH-SD-7" (senate) or "OH-HD-22" (house)
  county: string | null             // e.g. "Franklin County"
  city: string | null               // e.g. "Dublin"
  school_district: string | null    // e.g. "Dublin City School District"
}

interface CivicApiResponse {
  normalizedInput?: {
    city?: string
    state?: string
    zip?: string
    line1?: string
  }
  divisions?: Record<string, { name?: string; officeIndices?: number[] }>
  error?: { code: number; message: string }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts an OCD slug like "franklin_county" to a human-readable string
 * "Franklin County".
 */
function formatOcdSlug(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

/**
 * Parses the Google Civic Information API `divisions` map (keyed by OCD IDs)
 * and extracts the geographic levels CivicLens cares about.
 *
 * Example OCD IDs:
 *   ocd-division/country:us/state:oh
 *   ocd-division/country:us/state:oh/cd:12
 *   ocd-division/country:us/state:oh/sldu:7
 *   ocd-division/country:us/state:oh/sldl:22
 *   ocd-division/country:us/state:oh/county:franklin
 *   ocd-division/country:us/state:oh/place:dublin
 *   ocd-division/country:us/state:oh/unifiedschooldistrict:dublin_city
 */
function parseDivisions(
  divisions: CivicApiResponse['divisions'],
): JurisdictionResult {
  const result: JurisdictionResult = {
    federal_district: null,
    state: null,
    state_district: null,
    county: null,
    city: null,
    school_district: null,
  }

  if (!divisions) return result

  // First pass: extract state abbreviation (needed to build other IDs)
  for (const ocdId of Object.keys(divisions)) {
    // Matches ".../state:oh" at the end of the ID
    const stateOnly = ocdId.match(/\/state:([a-z]{2})$/)
    if (stateOnly) {
      result.state = stateOnly[1].toUpperCase()
      break
    }
  }

  const state = result.state ?? ''

  for (const [ocdId, division] of Object.entries(divisions)) {
    // Federal congressional district: .../state:xx/cd:N
    const cdMatch = ocdId.match(/\/cd:(\d+)/)
    if (cdMatch) {
      result.federal_district = `${state}-${cdMatch[1]}`
      continue
    }

    // State senate district: .../sldu:N
    const slduMatch = ocdId.match(/\/sldu:([^/]+)/)
    if (slduMatch) {
      result.state_district = `${state}-SD-${slduMatch[1]}`
      continue
    }

    // State house district: .../sldl:N (only set if senate not already set)
    const sldlMatch = ocdId.match(/\/sldl:([^/]+)/)
    if (sldlMatch && !result.state_district) {
      result.state_district = `${state}-HD-${sldlMatch[1]}`
      continue
    }

    // County: .../county:name
    const countyMatch = ocdId.match(/\/county:([^/]+)/)
    if (countyMatch) {
      const name = division.name ?? formatOcdSlug(countyMatch[1])
      result.county = name.includes('County') ? name : `${name} County`
      continue
    }

    // City / municipality: .../place:name
    const placeMatch = ocdId.match(/\/place:([^/]+)/)
    if (placeMatch) {
      result.city = division.name ?? formatOcdSlug(placeMatch[1])
      continue
    }

    // School districts: unified / elementary / secondary
    const schoolMatch = ocdId.match(
      /\/(unified|elementary|secondary)schooldistrict:([^/]+)/,
    )
    if (schoolMatch) {
      result.school_district = division.name ?? formatOcdSlug(schoolMatch[2])
      continue
    }
  }

  return result
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/jurisdictions/lookup?address=<street+city+state>
 *
 * Calls the Google Civic Information API and returns a structured breakdown
 * of the jurisdictions that govern the given address.
 *
 * @example
 * GET /api/jurisdictions/lookup?address=1600+Pennsylvania+Ave+NW+Washington+DC
 */
jurisdictions.get('/lookup', async c => {
  const address = c.req.query('address')?.trim()

  if (!address) {
    return c.json({ error: 'address query parameter is required' }, 400)
  }

  const apiKey = process.env.GOOGLE_CIVIC_API_KEY
  if (!apiKey) {
    return c.json({ error: 'GOOGLE_CIVIC_API_KEY is not configured' }, 503)
  }

  try {
    const url = new URL('https://www.googleapis.com/civicinfo/v2/representatives')
    url.searchParams.set('address', address)
    url.searchParams.set('key', apiKey)
    // We only need the divisions — skip office/official data to keep response small
    url.searchParams.set('includeOffices', 'false')

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })

    const body: CivicApiResponse = await res.json()

    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `Civic API returned HTTP ${res.status}`
      return c.json({ error: msg }, res.ok ? 500 : res.status)
    }

    const jurisdictionResult = parseDivisions(body.divisions)

    return c.json({
      normalized_address: body.normalizedInput ?? null,
      ...jurisdictionResult,
    })
  } catch (err) {
    console.error('[GET /api/jurisdictions/lookup]', err)
    return c.json({ error: 'Failed to look up jurisdiction' }, 500)
  }
})

export default jurisdictions
