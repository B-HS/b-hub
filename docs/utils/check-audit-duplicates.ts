import { sql } from 'drizzle-orm'
import { getDb } from '../../db/index'
import { calendarSubscription, mailMessages } from '../../db/schema'

const SAMPLE_LIMIT = 5

const db = getDb()

const mailDuplicates = await db
    .select({
        accountId: mailMessages.accountId,
        folderId: mailMessages.folderId,
        remoteMessageId: mailMessages.remoteMessageId,
        count: sql<number>`COUNT(*)`,
    })
    .from(mailMessages)
    .groupBy(mailMessages.accountId, mailMessages.folderId, mailMessages.remoteMessageId)
    .having(sql`COUNT(*) > 1`)

const subscriptionDuplicates = await db
    .select({ userId: calendarSubscription.userId, count: sql<number>`COUNT(*)` })
    .from(calendarSubscription)
    .groupBy(calendarSubscription.userId)
    .having(sql`COUNT(*) > 1`)

console.log(
    JSON.stringify(
        {
            mailMessagesDuplicateGroups: mailDuplicates.length,
            calendarSubscriptionDuplicateUsers: subscriptionDuplicates.length,
            samples: { mail: mailDuplicates.slice(0, SAMPLE_LIMIT), subscription: subscriptionDuplicates.slice(0, SAMPLE_LIMIT) },
        },
        null,
        2,
    ),
)

process.exit(0)
