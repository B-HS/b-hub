import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { getEnv } from '../lib/env'
import * as schema from './schema'

const POOL_CONNECTION_LIMIT = 20
const POOL_MAX_IDLE = 5
const POOL_IDLE_TIMEOUT_MS = 60_000
const POOL_KEEP_ALIVE_INITIAL_DELAY_MS = 10_000

const createDrizzleDb = (p: mysql.Pool) => drizzle(p, { schema, mode: 'default' })

let dbInstance: ReturnType<typeof createDrizzleDb> | null = null
let pool: mysql.Pool | null = null

export const getDb = () => {
    if (dbInstance) return dbInstance

    pool = mysql.createPool({
        uri: getEnv().DATABASE_URL,
        waitForConnections: true,
        connectionLimit: POOL_CONNECTION_LIMIT,
        maxIdle: POOL_MAX_IDLE,
        idleTimeout: POOL_IDLE_TIMEOUT_MS,
        enableKeepAlive: true,
        keepAliveInitialDelay: POOL_KEEP_ALIVE_INITIAL_DELAY_MS,
        queueLimit: 0,
    })

    dbInstance = createDrizzleDb(pool)
    return dbInstance
}

export const closeDb = async () => {
    if (pool) {
        await pool.end()
        pool = null
        dbInstance = null
    }
}

export type Database = ReturnType<typeof getDb>
