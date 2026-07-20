import { sql } from 'drizzle-orm'
import { getDb, closeDb } from '../db'

const INDEX_NAME = 'ft_mail_messages_subject_body'

const run = async () => {
    const db = getDb()

    const existing = await db.execute(
        sql`SELECT 1 AS present FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_messages' AND INDEX_NAME = ${INDEX_NAME} LIMIT 1`,
    )
    const rows = Array.isArray(existing) ? existing[0] : undefined
    if (Array.isArray(rows) && rows.length > 0) {
        console.log(`[mail-fulltext] '${INDEX_NAME}' 인덱스가 이미 존재합니다. 건너뜁니다.`)
        await closeDb()
        return
    }

    console.log(`[mail-fulltext] FULLTEXT 인덱스 생성 중: ${INDEX_NAME} (subject, body_text) WITH PARSER ngram`)
    await db.execute(sql`ALTER TABLE mail_messages ADD FULLTEXT INDEX ${sql.raw(INDEX_NAME)} (subject, body_text) WITH PARSER ngram`)
    console.log('[mail-fulltext] 완료. 검색 q 질의가 MATCH...AGAINST(ngram, 한국어 대응) 경로로 승격됩니다.')

    await closeDb()
}

run().catch(async (error) => {
    console.error(error)
    await closeDb()
    process.exit(1)
})
