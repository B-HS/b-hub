import { eq, inArray } from 'drizzle-orm'
import { getDb, closeDb } from '../db'
import { mailAccounts, mailMessages } from '../db/schema'
import { computeThreadIds } from '../lib/mail-thread'

const isDryRun = process.argv.includes('--dry-run')

const run = async () => {
    const db = getDb()
    const accounts = await db.select({ id: mailAccounts.id, email: mailAccounts.email }).from(mailAccounts)

    let totalScanned = 0
    let totalUpdated = 0

    for (const account of accounts) {
        const messages = await db
            .select({
                id: mailMessages.id,
                messageIdHeader: mailMessages.messageIdHeader,
                inReplyTo: mailMessages.inReplyTo,
                referencesHeader: mailMessages.referencesHeader,
                threadId: mailMessages.threadId,
                receivedAt: mailMessages.receivedAt,
                sentAt: mailMessages.sentAt,
            })
            .from(mailMessages)
            .where(eq(mailMessages.accountId, account.id))

        totalScanned += messages.length
        const threadIds = computeThreadIds(messages)

        const byThreadId = new Map<string, number[]>()
        for (const message of messages) {
            if (message.threadId) continue
            const next = threadIds.get(message.id)
            if (!next) continue
            const ids = byThreadId.get(next) ?? []
            ids.push(message.id)
            byThreadId.set(next, ids)
        }

        const accountUpdates = [...byThreadId.values()].reduce((sum, ids) => sum + ids.length, 0)
        console.log(`[account ${account.id}] ${account.email}: ${messages.length}건 스캔, ${accountUpdates}건 갱신 대상`)

        if (!isDryRun) {
            const CHUNK_SIZE = 500
            for (const [threadId, ids] of byThreadId) {
                for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                    await db.update(mailMessages).set({ threadId }).where(inArray(mailMessages.id, ids.slice(i, i + CHUNK_SIZE)))
                }
            }
        }
        totalUpdated += accountUpdates
    }

    console.log(`\n${isDryRun ? '[DRY-RUN] ' : ''}총 ${totalScanned}건 스캔, ${isDryRun ? '갱신 예정' : '갱신 완료'} ${totalUpdated}건`)
    await closeDb()
}

run().catch(async (error) => {
    console.error(error)
    await closeDb()
    process.exit(1)
})
