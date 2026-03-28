import { eq, and, gte, lte, or, isNotNull, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createCalendarService } from '../service/domain/calendar/calendar'
import { createCaldavService } from '../service/domain/calendar/caldav'
import type { ComposeCoreArgs } from './types'

export const composeCalendar = ({ db }: ComposeCoreArgs) => {
    const calendarService = createCalendarService({
        db: {
            getEventsByMonthRange: async (userId, startDate, endDate) => {
                const rows = await db
                    .select()
                    .from(schema.calendarEvent)
                    .where(
                        and(
                            eq(schema.calendarEvent.userId, userId),
                            or(
                                and(gte(schema.calendarEvent.dtstart, startDate), lte(schema.calendarEvent.dtstart, endDate)),
                                and(isNotNull(schema.calendarEvent.rrule), lte(schema.calendarEvent.dtstart, endDate)),
                            ),
                        ),
                    )
                return rows
            },

            getEventsByDateRange: async (userId, startDate, endDate, groupId?) => {
                const conditions = [
                    eq(schema.calendarEvent.userId, userId),
                    or(
                        and(gte(schema.calendarEvent.dtstart, startDate), lte(schema.calendarEvent.dtstart, endDate)),
                        and(isNotNull(schema.calendarEvent.rrule), lte(schema.calendarEvent.dtstart, endDate)),
                    ),
                ]
                if (groupId) {
                    conditions.push(eq(schema.calendarEvent.groupId, groupId))
                }
                return db
                    .select()
                    .from(schema.calendarEvent)
                    .where(and(...conditions))
            },

            getAllEvents: async (userId) => {
                return db.select().from(schema.calendarEvent).where(eq(schema.calendarEvent.userId, userId))
            },

            getEventByUid: async (userId, uid) => {
                const rows = await db
                    .select()
                    .from(schema.calendarEvent)
                    .where(and(eq(schema.calendarEvent.userId, userId), eq(schema.calendarEvent.uid, uid)))
                return rows[0] ?? null
            },

            getEventByUidWithDomain: async (userId, uid) => {
                const rows = await db
                    .select()
                    .from(schema.calendarEvent)
                    .where(and(eq(schema.calendarEvent.userId, userId), eq(schema.calendarEvent.uid, `${uid}@b-calendar`)))
                return rows[0] ?? null
            },

            insertEvent: async (data) => {
                await db.insert(schema.calendarEvent).values(data as typeof schema.calendarEvent.$inferInsert)
            },

            updateEvent: async (userId, uid, data) => {
                await db
                    .update(schema.calendarEvent)
                    .set(data as Partial<typeof schema.calendarEvent.$inferInsert>)
                    .where(and(eq(schema.calendarEvent.userId, userId), eq(schema.calendarEvent.uid, uid)))
            },

            deleteEventByUid: async (userId, uid) => {
                await db.delete(schema.calendarEvent).where(and(eq(schema.calendarEvent.userId, userId), eq(schema.calendarEvent.uid, uid)))
            },

            getGroupsByUser: async (userId) => {
                return db.select().from(schema.calendarGroup).where(eq(schema.calendarGroup.userId, userId)).orderBy(schema.calendarGroup.sortOrder)
            },

            getGroupById: async (userId, groupId) => {
                const rows = await db
                    .select()
                    .from(schema.calendarGroup)
                    .where(and(eq(schema.calendarGroup.userId, userId), eq(schema.calendarGroup.id, groupId)))
                return rows[0] ?? null
            },

            insertGroup: async (data) => {
                await db.insert(schema.calendarGroup).values(data)
            },

            updateGroup: async (userId, groupId, data) => {
                await db
                    .update(schema.calendarGroup)
                    .set(data)
                    .where(and(eq(schema.calendarGroup.userId, userId), eq(schema.calendarGroup.id, groupId)))
            },

            deleteGroup: async (userId, groupId) => {
                await db.delete(schema.calendarGroup).where(and(eq(schema.calendarGroup.userId, userId), eq(schema.calendarGroup.id, groupId)))
            },

            countEventsByGroup: async (userId, groupId) => {
                const rows = await db
                    .select({ count: sql`count(*)`.mapWith(Number) })
                    .from(schema.calendarEvent)
                    .where(and(eq(schema.calendarEvent.userId, userId), eq(schema.calendarEvent.groupId, groupId)))
                return rows[0]?.count ?? 0
            },

            getSubscription: async (userId) => {
                const rows = await db.select().from(schema.calendarSubscription).where(eq(schema.calendarSubscription.userId, userId))
                return rows[0] ?? null
            },

            getSubscriptionByToken: async (token) => {
                const rows = await db
                    .select()
                    .from(schema.calendarSubscription)
                    .where(and(eq(schema.calendarSubscription.token, token), eq(schema.calendarSubscription.isActive, true)))
                return rows[0] ?? null
            },

            getSubscriptionByIcsToken: async (token) => {
                const rows = await db
                    .select()
                    .from(schema.calendarSubscription)
                    .where(and(eq(schema.calendarSubscription.icsToken, token), eq(schema.calendarSubscription.isActive, true)))
                return rows[0] ?? null
            },

            insertSubscription: async (data) => {
                await db.transaction(async (tx) => {
                    const existing = await tx
                        .select()
                        .from(schema.calendarSubscription)
                        .where(eq(schema.calendarSubscription.userId, data.userId))
                    if (existing.length === 0) {
                        await tx.insert(schema.calendarSubscription).values(data)
                    }
                })
            },

            updateSubscription: async (userId, data) => {
                await db.update(schema.calendarSubscription).set(data).where(eq(schema.calendarSubscription.userId, userId))
            },

            updateSubscriptionToken: async (userId, token) => {
                await db.update(schema.calendarSubscription).set({ token }).where(eq(schema.calendarSubscription.userId, userId))
            },

            updateSubscriptionIcsToken: async (userId, icsToken) => {
                await db.update(schema.calendarSubscription).set({ icsToken }).where(eq(schema.calendarSubscription.userId, userId))
            },

            updateSubscriptionLastAccessed: async (id) => {
                await db.update(schema.calendarSubscription).set({ lastAccessedAt: new Date() }).where(eq(schema.calendarSubscription.id, id))
            },

            incrementCtag: async (userId) => {
                const newCtag = Date.now().toString(36)
                await db.update(schema.calendarSubscription).set({ ctag: newCtag }).where(eq(schema.calendarSubscription.userId, userId))
            },

            insertDeletedEvent: async (data) => {
                await db.insert(schema.deletedCalendarEvent).values({
                    id: data.id,
                    userId: data.userId,
                    uid: data.uid,
                    syncToken: data.syncToken,
                })
            },

            getUserTimezone: async (userId) => {
                const rows = await db.select({ timezone: schema.user.timezone }).from(schema.user).where(eq(schema.user.id, userId))
                return rows[0]?.timezone ?? null
            },

            updateUserTimezone: async (userId, timezone) => {
                await db.update(schema.user).set({ timezone }).where(eq(schema.user.id, userId))
            },
        },
    })

    const caldavService = createCaldavService({
        db: {
            getSubscriptionByUserId: async (userId) => {
                const rows = await db.select().from(schema.calendarSubscription).where(eq(schema.calendarSubscription.userId, userId))
                return rows[0] ?? null
            },

            getAllEvents: async (userId) => {
                return db.select().from(schema.calendarEvent).where(eq(schema.calendarEvent.userId, userId))
            },

            getChangedEventsSince: async (userId, since) => {
                return db
                    .select()
                    .from(schema.calendarEvent)
                    .where(and(eq(schema.calendarEvent.userId, userId), gte(schema.calendarEvent.updatedAt, since)))
            },

            getDeletedEventsSince: async (userId, previousCtag) => {
                return db
                    .select()
                    .from(schema.deletedCalendarEvent)
                    .where(and(eq(schema.deletedCalendarEvent.userId, userId), gte(schema.deletedCalendarEvent.syncToken, previousCtag)))
            },

            getFreeBusyEvents: async (userId, start, end) => {
                return db
                    .select({
                        dtstart: schema.calendarEvent.dtstart,
                        dtend: schema.calendarEvent.dtend,
                        status: schema.calendarEvent.status,
                    })
                    .from(schema.calendarEvent)
                    .where(
                        and(
                            eq(schema.calendarEvent.userId, userId),
                            eq(schema.calendarEvent.transp, 'OPAQUE'),
                            gte(schema.calendarEvent.dtend, start),
                            lte(schema.calendarEvent.dtstart, end),
                        ),
                    )
            },

            insertDeletedEvent: async (data) => {
                await db.insert(schema.deletedCalendarEvent).values({
                    id: data.id,
                    userId: data.userId,
                    uid: data.uid,
                    syncToken: data.syncToken,
                })
            },

            getUserTimezone: async (userId) => {
                const rows = await db.select({ timezone: schema.user.timezone }).from(schema.user).where(eq(schema.user.id, userId))
                return rows[0]?.timezone ?? null
            },
        },
    })

    return { calendarService, caldavService }
}
