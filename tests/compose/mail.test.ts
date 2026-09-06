import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/mysql-proxy'
import * as schema from '../../db/schema'
import { composeMail } from '../../compose/mail'

type ComposeMailArgs = Parameters<typeof composeMail>[0]

const EXISTING_MESSAGE_ID = 42

const withoutLimitParam = (params: unknown[]) => params.slice(0, -1)

const createRecordingCompose = (options: { hasExistingRow?: boolean; accountScopeRowIds?: number[] } = {}) => {
    const queries: { sql: string; params: unknown[] }[] = []
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            if (!sql.startsWith('select')) return { rows: [{ insertId: EXISTING_MESSAGE_ID, affectedRows: 1 }] }
            if (options.hasExistingRow && sql.startsWith('select `id` from `mail_messages`')) return { rows: [[EXISTING_MESSAGE_ID]] }
            if (options.accountScopeRowIds && sql.includes('order by')) return { rows: options.accountScopeRowIds.map((id) => [id]) }
            return { rows: [] }
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeMailArgs['db']

    const composed = composeMail({
        db,
        env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
        storageService: {} as unknown as ComposeMailArgs['storageService'],
    })

    return { composed, queries }
}

const upsertPayload = (identityScope: 'account' | 'folder') => ({
    accountId: 1,
    folderId: 7,
    identityScope,
    remoteMessageId: 'remote-1',
    messageIdHeader: null,
    threadId: null,
    inReplyTo: null,
    referencesHeader: null,
    fromAddress: null,
    toAddresses: [],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'subject',
    bodyHtml: null,
    bodyText: null,
    snippet: null,
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: false,
    sentAt: null,
    receivedAt: null,
    uid: 100,
})

describe('composeMail mailSyncDb.upsertMessage', () => {
    test('account 범위는 folderId 없이 (accountId, remoteMessageId) 로 기존 행을 찾는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessage(upsertPayload('account'))

        const identityQuery = queries.find((q) => q.sql.startsWith('select `id` from `mail_messages`'))
        expect(identityQuery).toBeDefined()
        expect(identityQuery?.sql).not.toContain('`folder_id`')
        expect(withoutLimitParam(identityQuery?.params ?? [])).toEqual([1, 'remote-1'])
    })

    test('folder 범위는 (accountId, folderId, remoteMessageId) 로 기존 행을 찾는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessage(upsertPayload('folder'))

        const identityQuery = queries.find((q) => q.sql.startsWith('select `id` from `mail_messages`'))
        expect(identityQuery?.sql).toContain('`folder_id`')
        expect(withoutLimitParam(identityQuery?.params ?? [])).toEqual([1, 7, 'remote-1'])
    })

    test('account 범위에서 기존 행이 있으면 INSERT 대신 UPDATE 하되 folderId 와 uid 는 건드리지 않는다', async () => {
        const { composed, queries } = createRecordingCompose({ hasExistingRow: true })
        const result = await composed.mailSyncDb.upsertMessage(upsertPayload('account'))

        expect(queries.some((q) => q.sql.startsWith('insert into `mail_messages`'))).toBe(false)
        const updateQuery = queries.find((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updateQuery).toBeDefined()
        expect(updateQuery?.sql).not.toContain('`folder_id` = ?')
        expect(updateQuery?.sql).not.toContain('`uid` = ?')
        expect(updateQuery?.params.at(-1)).toBe(EXISTING_MESSAGE_ID)
        expect(result.isNew).toBe(false)
    })

    test('account 범위 INSERT 의 on duplicate key update 에도 folderId 와 uid 가 없다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessage(upsertPayload('account'))

        const insertQuery = queries.find((q) => q.sql.startsWith('insert into `mail_messages`'))
        const duplicateClause = insertQuery?.sql.slice(insertQuery.sql.indexOf('on duplicate key update'))
        expect(duplicateClause).toBeDefined()
        expect(duplicateClause).not.toContain('`folder_id`')
        expect(duplicateClause).not.toContain('`uid`')
    })

    test('account 범위에서 동시 INSERT 로 행이 여러 개 생기면 가장 오래된 행만 남기고 지운다', async () => {
        const { composed, queries } = createRecordingCompose({ accountScopeRowIds: [11, 12, 13] })
        const result = await composed.mailSyncDb.upsertMessage(upsertPayload('account'))

        const deleteQuery = queries.find((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQuery).toBeDefined()
        expect(deleteQuery?.sql).toContain('`id` in (?, ?)')
        expect(deleteQuery?.params).toEqual([12, 13])
        expect(result.id).toBe(11)
    })

    test('folder 범위에서 기존 행이 없으면 INSERT 를 실행한다', async () => {
        const { composed, queries } = createRecordingCompose()
        const result = await composed.mailSyncDb.upsertMessage(upsertPayload('folder'))

        const insertQuery = queries.find((q) => q.sql.startsWith('insert into `mail_messages`'))
        expect(insertQuery).toBeDefined()
        expect(insertQuery?.sql).toContain('on duplicate key update')
        expect(insertQuery?.sql).not.toContain('`identity_scope`')
        expect(queries.some((q) => q.sql.startsWith('update `mail_messages`'))).toBe(false)
        expect(result.isNew).toBe(true)
    })

    test('folder 범위에서는 중복 정리 DELETE 를 하지 않는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessage(upsertPayload('folder'))

        expect(queries.some((q) => q.sql.startsWith('delete from `mail_messages`'))).toBe(false)
    })
})

describe('composeMail mailSyncDb.deleteMessagesByRemoteIds', () => {
    test('folder 범위는 folderId 조건을 포함한다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.deleteMessagesByRemoteIds({ accountId: 1, folderId: 7, identityScope: 'folder', remoteIds: ['a', 'b'] })

        const deleteQuery = queries.find((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQuery?.sql).toContain('`folder_id` = ?')
        expect(deleteQuery?.params).toEqual([1, 7, 'a', 'b'])
    })

    test('account 범위는 folderId 조건 없이 계정 전체에서 지운다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.deleteMessagesByRemoteIds({ accountId: 1, folderId: 7, identityScope: 'account', remoteIds: ['a'] })

        const deleteQuery = queries.find((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQuery?.sql).not.toContain('`folder_id` = ?')
        expect(deleteQuery?.params).toEqual([1, 'a'])
    })

    test('remoteIds 가 비면 쿼리를 실행하지 않는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.deleteMessagesByRemoteIds({ accountId: 1, folderId: 7, identityScope: 'folder', remoteIds: [] })

        expect(queries).toHaveLength(0)
    })
})

const createTransactionalCompose = (options: { currentRemoteId?: string; conflictIds?: number[] } = {}) => {
    const queries: { sql: string; params: unknown[] }[] = []
    let transactionCalls = 0
    const baseDb = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            if (sql.startsWith('select')) {
                if (sql.includes('`folder_id` = ?')) return { rows: (options.conflictIds ?? []).map((id) => [id]) }
                return { rows: options.currentRemoteId ? [[options.currentRemoteId]] : [] }
            }
            return { rows: [{ insertId: 0, affectedRows: 1 }] }
        },
        { schema, mode: 'default' },
    )
    const db: unknown = new Proxy(baseDb, {
        get: (target, prop) => {
            if (prop === 'transaction') {
                return async (fn: (tx: unknown) => Promise<void>) => {
                    transactionCalls += 1
                    return fn(db)
                }
            }
            const value = Reflect.get(target, prop)
            return typeof value === 'function' ? value.bind(target) : value
        },
    })

    const composed = composeMail({
        db: db as ComposeMailArgs['db'],
        env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
        storageService: {} as unknown as ComposeMailArgs['storageService'],
    })

    return { composed, queries, stats: () => ({ transactionCalls }) }
}

describe('composeMail mailMessageDb.moveMessages', () => {
    test('remoteMessageId 가 있으면 대상 폴더의 같은 remoteMessageId 행을 먼저 삭제하고 같은 트랜잭션에서 갱신한다', async () => {
        const { composed, queries, stats } = createTransactionalCompose()
        await composed.mailMessageDb.moveMessages([{ messageId: 1, remoteMessageId: 'remote-9', uid: 9 }], 2)

        expect(stats().transactionCalls).toBe(1)
        const deleteQuery = queries.find((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQuery).toBeDefined()
        expect(deleteQuery?.sql).toContain('`folder_id` = ?')
        expect(deleteQuery?.sql).toContain('`remote_message_id` = ?')
        expect(deleteQuery?.sql).toContain('`id` <> ?')
        expect(deleteQuery?.params).toEqual([2, 'remote-9', 1])

        const updateQuery = queries.find((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updateQuery?.sql).toContain('`folder_id` = ?')
        expect(updateQuery?.sql).toContain('`remote_message_id` = ?')
        expect(updateQuery?.sql).toContain('`uid` = ?')
        expect(updateQuery?.params.slice(0, 3)).toEqual([2, 'remote-9', 9])
        expect(updateQuery?.params.at(-1)).toBe(1)
        expect(queries.indexOf(deleteQuery!)).toBeLessThan(queries.indexOf(updateQuery!))
    })

    test('remoteMessageId 가 없고 대상 폴더에 충돌 행이 없으면 folderId 만 갱신한다', async () => {
        const { composed, queries, stats } = createTransactionalCompose({ currentRemoteId: '5' })
        await composed.mailMessageDb.moveMessages([{ messageId: 1 }], 2)

        expect(stats().transactionCalls).toBe(1)
        expect(queries.some((q) => q.sql.startsWith('delete from `mail_messages`'))).toBe(false)
        const conflictQuery = queries.find((q) => q.sql.startsWith('select') && q.sql.includes('`folder_id` = ?'))
        expect(conflictQuery?.params.slice(0, 3)).toEqual([2, '5', 1])
        const updateQuery = queries.find((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updateQuery?.sql).not.toContain('`remote_message_id` = ?')
        expect(updateQuery?.params[0]).toBe(2)
        expect(updateQuery?.params.at(-1)).toBe(1)
    })

    test('remoteMessageId 가 없고 대상 폴더에 같은 UID 행이 있으면 대상 행은 두고 옮기던 행만 지운다', async () => {
        const { composed, queries, stats } = createTransactionalCompose({ currentRemoteId: '5', conflictIds: [9] })
        await composed.mailMessageDb.moveMessages([{ messageId: 1 }], 2)

        expect(stats().transactionCalls).toBe(1)
        const deleteQueries = queries.filter((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQueries).toHaveLength(1)
        expect(deleteQueries[0].sql).toContain('`id` = ?')
        expect(deleteQueries[0].sql).not.toContain('`folder_id` = ?')
        expect(deleteQueries[0].params).toEqual([1])
        expect(queries.some((q) => q.sql.startsWith('update `mail_messages`'))).toBe(false)
    })

    test('여러 항목이어도 트랜잭션 한 번 안에서 항목별로 충돌 삭제와 갱신을 순서대로 실행한다', async () => {
        const { composed, queries, stats } = createTransactionalCompose()
        await composed.mailMessageDb.moveMessages(
            [
                { messageId: 1, remoteMessageId: 'remote-9', uid: 9 },
                { messageId: 2, remoteMessageId: 'remote-10', uid: null },
            ],
            2,
        )

        expect(stats().transactionCalls).toBe(1)
        const deleteQueries = queries.filter((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQueries).toHaveLength(2)
        expect(deleteQueries[0].params).toEqual([2, 'remote-9', 1])
        expect(deleteQueries[1].params).toEqual([2, 'remote-10', 2])

        const updates = queries.filter((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updates).toHaveLength(2)
        expect(updates[1].params.slice(0, 3)).toEqual([2, 'remote-10', null])
        expect(updates[1].params.at(-1)).toBe(2)
    })

    test('remoteMessageId 가 없는 항목들은 각각 충돌 검사 후 갱신한다', async () => {
        const { composed, queries, stats } = createTransactionalCompose({ currentRemoteId: '5' })
        await composed.mailMessageDb.moveMessages([{ messageId: 1 }, { messageId: 2 }, { messageId: 3 }], 5)

        expect(stats().transactionCalls).toBe(1)
        const updates = queries.filter((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updates).toHaveLength(3)
        expect(updates.map((q) => q.params[0])).toEqual([5, 5, 5])
        expect(updates.map((q) => q.params.at(-1))).toEqual([1, 2, 3])
    })

    test('빈 목록이면 아무 쿼리도 실행하지 않는다', async () => {
        const { composed, queries } = createTransactionalCompose()
        await composed.mailMessageDb.moveMessages([], 2)

        expect(queries).toHaveLength(0)
    })
})
