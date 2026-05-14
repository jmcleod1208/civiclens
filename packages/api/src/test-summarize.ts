import { summarizeDocument } from './jobs/summarize.js'

const SAMPLE_TITLE = 'H. Con. Res. 16 — Calling for Release of Cuban Political Prisoners'
const SAMPLE_TEXT = `
108th CONGRESS 1st Session H. CON. RES. 16
Calling for the immediate release of all political prisoners in Cuba,
including Dr. Oscar Elias Biscet, and for other purposes.

Whereas the Cuban Government found Dr. Oscar Elias Biscet, a 39-year-old
Afro-Cuban physician and human rights activist, guilty of dishonoring the
symbols of the fatherland and sentenced him to 3 years in prison;

Whereas thousands of political prisoners are being held in Cuba's prisons;

Resolved by the House of Representatives (the Senate concurring), That:
(1) the Congress calls on the Cuban Government to immediately release all
political prisoners, including Dr. Oscar Elias Biscet;
(2) Cuba must eliminate laws that restrict freedom of speech, association,
and movement;
(3) Cuba must hold free, multiparty, internationally supervised elections.
`.trim()

async function main() {
  console.log('Testing OpenAI summarization (no DB required)...\n')
  console.log(`Document: "${SAMPLE_TITLE}"`)
  console.log(`Text length: ${SAMPLE_TEXT.length} chars\n`)

  const summary = await summarizeDocument('test-id', SAMPLE_TEXT, SAMPLE_TITLE)

  console.log('Summary returned:\n')
  console.log('what_it_proposes:')
  console.log(' ', summary.what_it_proposes)
  console.log('\nwho_it_affects:')
  console.log(' ', summary.who_it_affects)
  console.log('\nwhat_it_means_for_you:')
  console.log(' ', summary.what_it_means_for_you)
  console.log('\nJSON (as stored in DB):')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch(console.error)
