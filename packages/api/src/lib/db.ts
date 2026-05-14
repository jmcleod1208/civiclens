import { PrismaClient } from '@civiclens/db'

// Single PrismaClient for the lifetime of the process.
// Bun/Node keep the process alive so a module-level singleton is correct here.
export const db = new PrismaClient()
