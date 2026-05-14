#!/usr/bin/env node
// Cursor afterFileEdit hook — normalizes .env file line endings to LF
'use strict'
const fs = require('fs')
const path = require('path')

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => (raw += chunk))
process.stdin.on('end', () => {
  let data = {}
  try {
    data = JSON.parse(raw)
  } catch {
    process.exit(0)
  }

  // Cursor sends different shapes depending on the event; try all known paths
  const filePath =
    (data && data.input && data.input.path) ||
    (data && data.tool_input && data.tool_input.path) ||
    (data && data.path) ||
    (data && data.file_path) ||
    ''

  // Only act on .env files (.env, .env.local, packages/db/.env, etc.)
  if (!filePath || !path.basename(filePath).startsWith('.env')) {
    process.exit(0)
  }

  try {
    const original = fs.readFileSync(filePath, 'utf8')
    // Normalize CRLF → LF, then lone CR → LF
    const normalized = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (normalized !== original) {
      fs.writeFileSync(filePath, normalized, { encoding: 'utf8' })
      process.stderr.write('[fix-env-endings] normalized line endings in ' + filePath + '\n')
    }
  } catch (err) {
    process.stderr.write('[fix-env-endings] could not process ' + filePath + ': ' + err.message + '\n')
  }

  process.exit(0)
})
