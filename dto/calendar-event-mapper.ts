import { z } from 'zod'
import { recurrenceRuleSchema } from './calendar-event'
import type { CalendarEvent } from '../service/domain/calendar/calendar'

export const createEventBodySchema = z.object({
    title: z.string().min(1).max(500),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    isAllDay: z.boolean().default(false),
    groupId: z.string().min(1).optional().nullable(),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
    status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED']).optional(),
    transp: z.enum(['TRANSPARENT', 'OPAQUE']).optional(),
    priority: z.number().int().min(0).max(9).optional(),
    categories: z.array(z.string()).optional(),
    color: z.string().optional(),
    rrule: recurrenceRuleSchema.optional(),
})

export const patchEventBodySchema = createEventBodySchema.partial()

export type CreateEventBody = z.infer<typeof createEventBodySchema>
export type PatchEventBody = z.infer<typeof patchEventBodySchema>

// Drizzle ORM은 Date를 UTC 문자열로 직렬화함
// allDay: 날짜만 중요, DB에 YYYY-MM-DD 00:00:00 그대로 저장 → Z suffix
// 시간 이벤트: 사용자 입력은 KST, DB에도 KST 기준 시간 저장해야 CalDAV에서 맞음
//   KST 09:00 → DB에 09:00 저장하려면 → Drizzle이 UTC로 보내니까
//   UTC Date로 09:00을 만들어야 함 → 즉 Z suffix 동일
// 결론: 둘 다 Z suffix로 "DB에 저장되는 값 = 입력 그대로"를 보장
const combineDatetime = (date: string, time: string | undefined, isAllDay: boolean): Date => {
    if (isAllDay || !time) {
        return new Date(`${date}T00:00:00Z`)
    }
    return new Date(`${date}T${time}:00Z`)
}

// Drizzle이 DB에서 읽을 때도 UTC Date를 반환하므로, UTC 기준으로 포맷
const formatDate = (date: Date): string => {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

const formatTime = (date: Date): string => {
    const h = String(date.getUTCHours()).padStart(2, '0')
    const m = String(date.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
}

export const toEventInput = (data: CreateEventBody) => ({
    summary: data.title,
    dtstart: combineDatetime(data.startDate, data.startTime, data.isAllDay),
    dtend: combineDatetime(data.endDate, data.endTime, data.isAllDay),
    isAllDay: data.isAllDay,
    groupId: data.groupId,
    description: data.description,
    location: data.location,
    status: data.status,
    transp: data.transp,
    priority: data.priority,
    categories: data.categories,
    color: data.color,
    rrule: data.rrule
        ? {
              freq: data.rrule.freq,
              interval: data.rrule.interval,
              count: data.rrule.count,
              until: data.rrule.until ? new Date(data.rrule.until) : undefined,
              byDay: data.rrule.byDay,
              byMonth: data.rrule.byMonth,
              byMonthDay: data.rrule.byMonthDay,
          }
        : undefined,
})

export const toEventPatch = (existing: CalendarEvent, data: PatchEventBody) => {
    const isAllDay = data.isAllDay ?? existing.isAllDay

    const dtstart =
        data.startDate !== undefined
            ? combineDatetime(data.startDate, data.startTime ?? (isAllDay ? undefined : formatTime(existing.dtstart)), isAllDay)
            : data.startTime !== undefined
              ? combineDatetime(formatDate(existing.dtstart), data.startTime, isAllDay)
              : existing.dtstart

    const dtend =
        data.endDate !== undefined
            ? combineDatetime(data.endDate, data.endTime ?? (isAllDay ? undefined : formatTime(existing.dtend)), isAllDay)
            : data.endTime !== undefined
              ? combineDatetime(formatDate(existing.dtend), data.endTime, isAllDay)
              : existing.dtend

    return {
        uid: existing.uid,
        summary: data.title ?? existing.summary,
        dtstart,
        dtend,
        isAllDay,
        groupId: data.groupId !== undefined ? data.groupId : existing.groupId,
        description: data.description !== undefined ? data.description : existing.description,
        location: data.location !== undefined ? data.location : existing.location,
        status: data.status !== undefined ? data.status : existing.status,
        transp: data.transp !== undefined ? data.transp : existing.transp,
        priority: data.priority !== undefined ? data.priority : existing.priority,
        categories: data.categories !== undefined ? data.categories : existing.categories,
        color: data.color !== undefined ? data.color : existing.color,
        rrule:
            data.rrule !== undefined
                ? data.rrule
                    ? {
                          freq: data.rrule.freq,
                          interval: data.rrule.interval,
                          count: data.rrule.count,
                          until: data.rrule.until ? new Date(data.rrule.until) : undefined,
                          byDay: data.rrule.byDay,
                          byMonth: data.rrule.byMonth,
                          byMonthDay: data.rrule.byMonthDay,
                      }
                    : undefined
                : existing.rrule,
        sequence: existing.sequence,
    }
}

export const toEventResponse = (event: CalendarEvent) => ({
    id: event.uid,
    uid: event.uid,
    title: event.summary,
    startDate: formatDate(event.dtstart),
    endDate: formatDate(event.dtend),
    startTime: event.isAllDay ? undefined : formatTime(event.dtstart),
    endTime: event.isAllDay ? undefined : formatTime(event.dtend),
    isAllDay: event.isAllDay,
    groupId: event.groupId ?? null,
    description: event.description,
    location: event.location,
    status: event.status?.toLowerCase(),
    transp: event.transp,
    priority: event.priority,
    categories: event.categories,
    color: event.color,
    rrule: event.rrule
        ? {
              freq: event.rrule.freq,
              interval: event.rrule.interval,
              count: event.rrule.count,
              until: event.rrule.until?.toISOString(),
              byDay: event.rrule.byDay,
              byMonth: event.rrule.byMonth,
              byMonthDay: event.rrule.byMonthDay,
          }
        : undefined,
    sequence: event.sequence,
})
