import { sql } from 'drizzle-orm'
import { getDb } from '../../db/index'

const TABLES = [
    'calendar_subscription',
    'calendar_event',
    'mail_messages',
    'mail_sync_logs',
    'posts',
    'comments',
    'messages',
    'log_events',
    'weather_api_log',
    'image_assets',
    'resumes',
]

const db = getDb()

const [rows] = await db.execute(
    sql`SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${sql.join(
            TABLES.map((name) => sql`${name}`),
            sql`, `,
        )})
        GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
        ORDER BY TABLE_NAME, INDEX_NAME`,
)

console.log(JSON.stringify(rows, null, 2))

process.exit(0)
