import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.json({ message: 'CivicLens API' }))

export default app
