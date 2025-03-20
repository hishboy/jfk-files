import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export const drizzleDB = drizzle(
  postgres(process.env.POSTGRES_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10
  })
)
