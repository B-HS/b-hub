import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/mysql-core'
import type { MySqlTable } from 'drizzle-orm/mysql-core'
import {
    calendarEvent,
    calendarSubscription,
    comments,
    imageAssets,
    logEvents,
    mailSyncLogs,
    messages,
    posts,
    resumes,
    weatherApiLog,
} from '../../db/schema'

const indexNames = (table: MySqlTable) => getTableConfig(table).indexes.map((idx) => idx.config.name)

const indexColumns = (table: MySqlTable, name: string) => {
    const found = getTableConfig(table).indexes.find((idx) => idx.config.name === name)
    if (!found) return null
    return found.config.columns.map((column) => ('name' in column ? column.name : ''))
}

const uniqueConstraintNames = (table: MySqlTable) => getTableConfig(table).uniqueConstraints.map((uq) => uq.name)

describe('db/schema 인덱스 정의 (P-02)', () => {
    test('posts 는 공개 목록 조회용 복합 인덱스를 가진다', () => {
        expect(indexColumns(posts, 'idx_posts_published_hide_created')).toEqual(['isPublished', 'isHide', 'created_at'])
    })

    test('comments 는 게시글별 최신순 조회용 복합 인덱스를 가진다', () => {
        expect(indexColumns(comments, 'idx_comments_post_created')).toEqual(['postId', 'created_at'])
    })

    test('messages 는 사용자별 미삭제 최신순 조회용 복합 인덱스를 가진다', () => {
        expect(indexColumns(messages, 'idx_messages_user_deleted_created')).toEqual(['userId', 'deleted_at', 'created_at'])
    })

    test('log_events 는 created_at 단일 인덱스를 가진다', () => {
        expect(indexColumns(logEvents, 'idx_log_events_created')).toEqual(['created_at'])
    })

    test('weather_api_log 는 created_at 단일 인덱스를 가진다', () => {
        expect(indexColumns(weatherApiLog, 'idx_weather_api_log_created')).toEqual(['created_at'])
    })

    test('image_assets 는 created_at 단일 인덱스를 가진다', () => {
        expect(indexColumns(imageAssets, 'idx_image_assets_created')).toEqual(['created_at'])
    })

    test('mail_sync_logs 는 계정별 최신순 조회용 복합 인덱스를 가진다', () => {
        expect(indexColumns(mailSyncLogs, 'idx_mail_sync_logs_account_created')).toEqual(['account_id', 'created_at'])
    })

    test('resumes 는 타입별 최신순 조회용 복합 인덱스를 가진다', () => {
        expect(indexColumns(resumes, 'idx_resumes_type_updated')).toEqual(['type', 'updated_at'])
    })

    test('추가한 인덱스명은 idx_<table>_<cols> 규칙을 따른다', () => {
        expect(indexNames(posts)).toContain('idx_posts_published_hide_created')
        expect(indexNames(comments)).toContain('idx_comments_post_created')
        expect(indexNames(messages)).toContain('idx_messages_user_deleted_created')
        expect(indexNames(imageAssets)).toContain('idx_image_assets_created')
    })
})

describe('db/schema 중복 인덱스 제거 (P-02)', () => {
    test('calendar_event.uid 는 unique 만 남고 별도 index 는 없다', () => {
        expect(calendarEvent.uid.isUnique).toBe(true)
        expect(indexNames(calendarEvent)).not.toContain('idx_calendar_event_uid')
        expect(indexColumns(calendarEvent, 'idx_calendar_event_uid')).toBeNull()
    })

    test('calendar_subscription.token / ics_token 은 unique 만 남고 별도 index 는 없다', () => {
        expect(calendarSubscription.token.isUnique).toBe(true)
        expect(calendarSubscription.icsToken.isUnique).toBe(true)
        expect(indexNames(calendarSubscription)).not.toContain('idx_subscription_token')
        expect(indexNames(calendarSubscription)).not.toContain('idx_subscription_ics_token')
    })

    test('calendar_event 의 나머지 인덱스는 유지된다', () => {
        expect(indexNames(calendarEvent).toSorted()).toEqual([
            'idx_calendar_event_group',
            'idx_calendar_event_user',
            'idx_calendar_event_user_dtstart',
        ])
    })

    test('calendar_subscription.user_id 는 FK 라 단일 index 를 unique 와 함께 유지한다(drizzle push 가 생성보다 삭제를 먼저 실행)', () => {
        expect(uniqueConstraintNames(calendarSubscription)).toContain('uq_calendar_subscription_user')
        expect(indexColumns(calendarSubscription, 'idx_subscription_user')).toEqual(['user_id'])
    })

    test('mail_sync_logs.account_id 는 FK 라 단일 index 를 복합 인덱스와 함께 유지한다', () => {
        expect(indexColumns(mailSyncLogs, 'idx_mail_sync_logs_account')).toEqual(['account_id'])
        expect(indexColumns(mailSyncLogs, 'idx_mail_sync_logs_account_created')).toEqual(['account_id', 'created_at'])
    })
})

describe('db/schema 기존 인덱스 유지', () => {
    test('log_events 는 기존 복합 인덱스 4종에 created 인덱스만 더해진다', () => {
        expect(indexNames(logEvents).toSorted()).toEqual([
            'idx_log_events_code_resolved',
            'idx_log_events_created',
            'idx_log_events_device_created',
            'idx_log_events_service_created',
            'idx_log_events_severity_created',
        ])
    })

    test('weather_api_log 의 기존 인덱스 2종이 그대로 있다', () => {
        expect(indexColumns(weatherApiLog, 'idx_weather_api_log_user')).toEqual(['user_id'])
        expect(indexColumns(weatherApiLog, 'idx_weather_api_log_key_created')).toEqual(['key_id', 'created_at'])
    })

    test('resumes 의 기존 사용자 인덱스가 그대로 있다', () => {
        expect(indexColumns(resumes, 'idx_resumes_user')).toEqual(['user_id'])
    })
})
