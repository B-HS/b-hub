import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema'

const createDrizzleDb = (p: mysql.Pool) => drizzle(p, { schema, mode: 'default' })

let dbInstance: ReturnType<typeof createDrizzleDb> | null = null
let pool: mysql.Pool | null = null

export const getDb = () => {
    if (dbInstance) return dbInstance

    pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
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
