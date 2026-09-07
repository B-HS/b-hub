import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/mysql-proxy'
import * as schema from '../../db/schema'
import { composeMail } from '../../compose/mail'

type ComposeMailArgs = Parameters<typeof composeMail>[0]

const EXISTING_MESSAGE_ID = 42

const IDENTITY_SELECT_PREFIX = 'select `id`, `remote_message_id` from `mail_messages`'

const createRecordingCompose = (options: { existingRows?: [number, string][]; insertedRows?: [number, string][] } = {}) => {
    const queries: { sql: string; params: unknown[] }[] = []
    let identitySelectCount = 0
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            if (!sql.startsWith('select')) return { rows: [{ insertId: EXISTING_MESSAGE_ID, affectedRows: 1 }] }
            if (sql.startsWith(IDENTITY_SELECT_PREFIX)) {
                identitySelectCount += 1
                return { rows: identitySelectCount === 1 ? (options.existingRows ?? []) : (options.insertedRows ?? []) }
            }
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

const messagePayload = (remoteMessageId = 'remote-1') => ({
    remoteMessageId,
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

const upsertPayload = (identityScope: 'account' | 'folder', remoteMessageIds = ['remote-1']) => ({
    accountId: 1,
    folderId: 7,
    identityScope,
    messages: remoteMessageIds.map((remoteMessageId) => messagePayload(remoteMessageId)),
})

const createDuplicateInsertCompose = () => {
    const db = drizzle(
        async (sql) => {
            if (sql.startsWith('insert into `mail_accounts`')) {
                throw Object.assign(new Error("Duplicate entry 'user-1-dup@test.com' for key 'uq_mail_accounts_user_email'"), {
                    code: 'ER_DUP_ENTRY',
                })
            }
            return { rows: [] }
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeMailArgs['db']

    return composeMail({
        db,
        env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
        storageService: {} as unknown as ComposeMailArgs['storageService'],
    })
}

describe('composeMail mailAccountDb.insert', () => {
    test('(userId, email) 중복이면 INTERNAL_ERROR 대신 MAIL_ACCOUNT_ALREADY_EXISTS 를 던진다', async () => {
        const composed = createDuplicateInsertCompose()

        await expect(composed.mailAccountService.create('user-1', { provider: 'imap', email: 'dup@test.com' })).rejects.toMatchObject({
            code: 'MAIL_ACCOUNT_ALREADY_EXISTS',
            statusCode: 409,
        })
    })
})

describe('composeMail mailSyncDb.upsertMessages', () => {
    test('account 범위는 folderId 없이 (accountId, remoteMessageId) 로 기존 행을 찾는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessages(upsertPayload('account'))

        const identityQuery = queries.find((q) => q.sql.startsWith(IDENTITY_SELECT_PREFIX))
        expect(identityQuery).toBeDefined()
        expect(identityQuery?.sql).not.toContain('`folder_id`')
        expect(identityQuery?.params).toEqual([1, 'remote-1'])
    })

    test('folder 범위는 (accountId, folderId, remoteMessageId) 로 기존 행을 찾는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessages(upsertPayload('folder'))

        const identityQuery = queries.find((q) => q.sql.startsWith(IDENTITY_SELECT_PREFIX))
        expect(identityQuery?.sql).toContain('`folder_id`')
        expect(identityQuery?.params).toEqual([1, 7, 'remote-1'])
    })

    test('메시지 수와 무관하게 identity 조회는 remoteMessageId in (...) 한 번이다', async () => {
        const { composed, queries } = createRecordingCompose({ existingRows: [[EXISTING_MESSAGE_ID, 'remote-2']] })
        const results = await composed.mailSyncDb.upsertMessages(upsertPayload('folder', ['remote-1', 'remote-2', 'remote-3']))

        const identityQueries = queries.filter((q) => q.sql.startsWith(IDENTITY_SELECT_PREFIX))
        expect(identityQueries).toHaveLength(2)
        expect(identityQueries[0].sql).toContain('`remote_message_id` in (?, ?, ?)')
        expect(identityQueries[0].params).toEqual([1, 7, 'remote-1', 'remote-2', 'remote-3'])
        expect(identityQueries[1].params).toEqual([1, 7, 'remote-1', 'remote-3'])
        expect(queries.filter((q) => q.sql.startsWith('insert into `mail_messages`'))).toHaveLength(2)
        expect(queries.filter((q) => q.sql.startsWith('update `mail_messages`'))).toHaveLength(1)
        expect(results.map((r) => r.isNew)).toEqual([true, false, true])
        expect(results[1].id).toBe(EXISTING_MESSAGE_ID)
    })

    test('account 범위에서 기존 행이 있으면 INSERT 대신 UPDATE 하되 folderId 와 uid 는 건드리지 않는다', async () => {
        const { composed, queries } = createRecordingCompose({ existingRows: [[EXISTING_MESSAGE_ID, 'remote-1']] })
        const [result] = await composed.mailSyncDb.upsertMessages(upsertPayload('account'))

        expect(queries.some((q) => q.sql.startsWith('insert into `mail_messages`'))).toBe(false)
        const updateQuery = queries.find((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updateQuery).toBeDefined()
        expect(updateQuery?.sql).not.toContain('`folder_id` = ?')
        expect(updateQuery?.sql).not.toContain('`uid` = ?')
        expect(updateQuery?.params.at(-1)).toBe(EXISTING_MESSAGE_ID)
        expect(result.isNew).toBe(false)
        expect(result.id).toBe(EXISTING_MESSAGE_ID)
    })

    test('account 범위 INSERT 의 on duplicate key update 에도 folderId 와 uid 가 없다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessages(upsertPayload('account'))

        const insertQuery = queries.find((q) => q.sql.startsWith('insert into `mail_messages`'))
        const duplicateClause = insertQuery?.sql.slice(insertQuery.sql.indexOf('on duplicate key update'))
        expect(duplicateClause).toBeDefined()
        expect(duplicateClause).not.toContain('`folder_id`')
        expect(duplicateClause).not.toContain('`uid`')
    })

    test('account 범위에서 동시 INSERT 로 행이 여러 개 생기면 가장 오래된 행만 남기고 한 번에 지운다', async () => {
        const { composed, queries } = createRecordingCompose({
            insertedRows: [
                [11, 'remote-1'],
                [12, 'remote-1'],
                [13, 'remote-1'],
            ],
        })
        const [result] = await composed.mailSyncDb.upsertMessages(upsertPayload('account'))

        const deleteQueries = queries.filter((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(deleteQueries).toHaveLength(1)
        expect(deleteQueries[0].sql).toContain('`id` in (?, ?)')
        expect(deleteQueries[0].params).toEqual([12, 13])
        expect(result.id).toBe(11)
    })

    test('folder 범위에서 기존 행이 없으면 INSERT 를 실행한다', async () => {
        const { composed, queries } = createRecordingCompose({ insertedRows: [[EXISTING_MESSAGE_ID, 'remote-1']] })
        const [result] = await composed.mailSyncDb.upsertMessages(upsertPayload('folder'))

        const insertQuery = queries.find((q) => q.sql.startsWith('insert into `mail_messages`'))
        expect(insertQuery).toBeDefined()
        expect(insertQuery?.sql).toContain('on duplicate key update')
        expect(insertQuery?.sql).not.toContain('`identity_scope`')
        expect(queries.some((q) => q.sql.startsWith('update `mail_messages`'))).toBe(false)
        expect(result.isNew).toBe(true)
        expect(result.id).toBe(EXISTING_MESSAGE_ID)
    })

    test('folder 범위에서는 중복 정리 DELETE 를 하지 않는다', async () => {
        const { composed, queries } = createRecordingCompose({
            insertedRows: [
                [11, 'remote-1'],
                [12, 'remote-1'],
            ],
        })
        await composed.mailSyncDb.upsertMessages(upsertPayload('folder'))

        expect(queries.some((q) => q.sql.startsWith('delete from `mail_messages`'))).toBe(false)
    })

    test('INSERT 에는 accountId 와 folderId 가 값으로 들어간다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertMessages(upsertPayload('folder'))

        const insertQuery = queries.find((q) => q.sql.startsWith('insert into `mail_messages`'))
        expect(insertQuery?.params.slice(0, 3)).toEqual([1, 7, 'remote-1'])
    })

    test('한 배치에 같은 remoteMessageId 가 두 번 오면 INSERT 는 한 번만 하고 나머지는 갱신한다', async () => {
        const { composed, queries } = createRecordingCompose({ insertedRows: [[EXISTING_MESSAGE_ID, 'remote-1']] })
        const results = await composed.mailSyncDb.upsertMessages(upsertPayload('folder', ['remote-1', 'remote-1']))

        expect(queries.filter((q) => q.sql.startsWith('insert into `mail_messages`'))).toHaveLength(1)
        const updateQueries = queries.filter((q) => q.sql.startsWith('update `mail_messages`'))
        expect(updateQueries).toHaveLength(1)
        expect(updateQueries[0].params.at(-1)).toBe(EXISTING_MESSAGE_ID)
        expect(results.map((r) => r.isNew)).toEqual([true, false])
        expect(results.map((r) => r.id)).toEqual([EXISTING_MESSAGE_ID, EXISTING_MESSAGE_ID])
    })

    test('행을 찾지 못하면 id 를 null 로 돌려준다', async () => {
        const { composed } = createRecordingCompose()
        const [result] = await composed.mailSyncDb.upsertMessages(upsertPayload('folder'))

        expect(result.id).toBeNull()
        expect(result.isNew).toBe(true)
    })

    test('빈 목록이면 아무 쿼리도 실행하지 않는다', async () => {
        const { composed, queries } = createRecordingCompose()
        const results = await composed.mailSyncDb.upsertMessages(upsertPayload('folder', []))

        expect(results).toEqual([])
        expect(queries).toHaveLength(0)
    })
})

describe('composeMail mailSyncDb.upsertAttachments', () => {
    test('여러 첨부를 INSERT 한 번으로 upsert 하고 충돌 시 행별 값으로 갱신한다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertAttachments([
            {
                messageId: 1,
                remoteAttachmentId: 'att-1',
                filename: 'a.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 10,
                contentId: null,
                isInline: false,
            },
            { messageId: 1, remoteAttachmentId: 'att-2', filename: 'b.png', mimeType: 'image/png', sizeBytes: 20, contentId: 'cid', isInline: true },
        ])

        const insertQueries = queries.filter((q) => q.sql.startsWith('insert into `mail_attachments`'))
        expect(insertQueries).toHaveLength(1)
        expect(insertQueries[0].sql).toContain('on duplicate key update')
        expect(insertQueries[0].sql).toContain('`filename` = values(`filename`)')
        expect(insertQueries[0].sql).toContain('`is_inline` = values(`is_inline`)')
        expect(insertQueries[0].sql).not.toContain('`message_id` = values(')
        expect(insertQueries[0].params).toEqual([
            1,
            'att-1',
            'a.pdf',
            'application/pdf',
            10,
            null,
            false,
            1,
            'att-2',
            'b.png',
            'image/png',
            20,
            'cid',
            true,
        ])
        expect(queries.some((q) => q.sql.startsWith('select'))).toBe(false)
    })

    test('빈 목록이면 아무 쿼리도 실행하지 않는다', async () => {
        const { composed, queries } = createRecordingCompose()
        await composed.mailSyncDb.upsertAttachments([])

        expect(queries).toHaveLength(0)
    })
})

describe('composeMail mailSyncDb.countsByFolder', () => {
    test('메시지 수와 안읽음 수를 한 번의 쿼리로 집계한다', async () => {
        const queries: { sql: string; params: unknown[] }[] = []
        const db = drizzle(
            async (sql, params) => {
                queries.push({ sql, params })
                return { rows: [[10, '3']] }
            },
            { schema, mode: 'default' },
        ) as unknown as ComposeMailArgs['db']
        const composed = composeMail({
            db,
            env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
            storageService: {} as unknown as ComposeMailArgs['storageService'],
        })

        const counts = await composed.mailSyncDb.countsByFolder(7)

        expect(queries).toHaveLength(1)
        expect(queries[0].sql).toContain('COUNT(*)')
        expect(queries[0].sql).toContain('SUM(CASE WHEN')
        expect(queries[0].params).toEqual([7])
        expect(counts).toEqual({ messageCount: 10, unreadCount: 3 })
    })

    test('행이 없으면 0 으로 집계한다', async () => {
        const db = drizzle(async () => ({ rows: [[0, null]] }), { schema, mode: 'default' }) as unknown as ComposeMailArgs['db']
        const composed = composeMail({
            db,
            env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
            storageService: {} as unknown as ComposeMailArgs['storageService'],
        })

        expect(await composed.mailSyncDb.countsByFolder(7)).toEqual({ messageCount: 0, unreadCount: 0 })
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

const createLockCompose = (affectedRows: number) => {
    const queries: { sql: string; params: unknown[] }[] = []
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            if (sql.startsWith('select')) return { rows: [] }
            return { rows: [{ insertId: 0, affectedRows }] }
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

describe('composeMail mailSyncDb 동기화 락', () => {
    test('tryAcquireSyncLock 은 running 이 아니거나 오래된 행만 조건부로 갱신하고 성공 여부를 반환한다', async () => {
        const { composed, queries } = createLockCompose(1)
        const acquired = await composed.mailSyncDb.tryAcquireSyncLock(3, 300_000)

        expect(acquired).toBe(true)
        const update = queries.find((q) => q.sql.startsWith('update `mail_accounts`'))
        expect(update).toBeDefined()
        expect(update?.sql).toContain('`last_sync_status` = ?')
        expect(update?.sql).toContain('`last_sync_at` is null')
        expect(update?.sql).toContain('`last_sync_at` < ?')
        expect(update?.params).toContain('running')
        expect(update?.params).toContain(3)
    })

    test('조건에 맞는 행이 없으면 tryAcquireSyncLock 이 false 를 반환한다', async () => {
        const { composed } = createLockCompose(0)
        expect(await composed.mailSyncDb.tryAcquireSyncLock(3, 300_000)).toBe(false)
    })

    test('releaseSyncLock 은 아직 running 인 행만 되돌린다', async () => {
        const { composed, queries } = createLockCompose(1)
        await composed.mailSyncDb.releaseSyncLock(3)

        const update = queries.find((q) => q.sql.startsWith('update `mail_accounts`'))
        expect(update?.params).toContain('error')
        expect(update?.params.slice(-2)).toEqual([3, 'running'])
    })
})

const createDeleteMessagesCompose = (r2Keys: string[]) => {
    const queries: { sql: string; params: unknown[] }[] = []
    const deletedKeys: string[] = []
    const db = drizzle(
        async (sql, params) => {
            queries.push({ sql, params })
            if (sql.startsWith('select `r2_key`')) return { rows: r2Keys.map((key) => [key]) }
            if (sql.startsWith('select')) return { rows: [] }
            return { rows: [{ insertId: 0, affectedRows: 1 }] }
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeMailArgs['db']

    const composed = composeMail({
        db,
        env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
        storageService: {
            del: async (key: string) => {
                deletedKeys.push(key)
            },
        } as unknown as ComposeMailArgs['storageService'],
    })

    return { composed, queries, deletedKeys }
}

describe('composeMail mailMessageDb.deleteMessages', () => {
    test('캐시된 첨부의 R2 오브젝트를 먼저 지운 뒤 메시지 행을 삭제한다', async () => {
        const { composed, queries, deletedKeys } = createDeleteMessagesCompose(['mail/attachments/1/10/a.pdf'])
        await composed.mailMessageDb.deleteMessages([1])

        expect(deletedKeys).toEqual(['mail/attachments/1/10/a.pdf'])
        const selectIndex = queries.findIndex((q) => q.sql.startsWith('select `r2_key`'))
        const deleteIndex = queries.findIndex((q) => q.sql.startsWith('delete from `mail_messages`'))
        expect(selectIndex).toBeGreaterThanOrEqual(0)
        expect(deleteIndex).toBeGreaterThan(selectIndex)
    })

    test('R2 삭제가 실패해도 메시지 행 삭제는 진행한다', async () => {
        const queries: { sql: string; params: unknown[] }[] = []
        const db = drizzle(
            async (sql, params) => {
                queries.push({ sql, params })
                if (sql.startsWith('select `r2_key`')) return { rows: [['mail/attachments/1/10/a.pdf']] }
                if (sql.startsWith('select')) return { rows: [] }
                return { rows: [{ insertId: 0, affectedRows: 1 }] }
            },
            { schema, mode: 'default' },
        ) as unknown as ComposeMailArgs['db']
        const composed = composeMail({
            db,
            env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
            storageService: { del: async () => Promise.reject(new Error('R2 down')) } as unknown as ComposeMailArgs['storageService'],
        })

        await composed.mailMessageDb.deleteMessages([1])
        expect(queries.some((q) => q.sql.startsWith('delete from `mail_messages`'))).toBe(true)
    })

    test('빈 목록이면 아무 쿼리도 실행하지 않는다', async () => {
        const { composed, queries } = createDeleteMessagesCompose([])
        await composed.mailMessageDb.deleteMessages([])

        expect(queries).toHaveLength(0)
    })
})

describe('composeMail FULLTEXT 프로브', () => {
    test('프로브가 실패하면 LIKE 로 폴백하고 다음 검색에서 다시 프로브한다', async () => {
        const probeQueries: string[] = []
        const searchQueries: string[] = []
        let shouldProbeFail = true
        const db = drizzle(
            async (sql) => {
                if (sql.includes('information_schema')) {
                    probeQueries.push(sql)
                    if (shouldProbeFail) throw new Error('probe failed')
                    return { rows: [[1]] }
                }
                if (sql.startsWith('select `id` from `mail_accounts`')) return { rows: [[1]] }
                if (sql.includes('COUNT(*)')) return { rows: [[0]] }
                searchQueries.push(sql)
                return { rows: [] }
            },
            { schema, mode: 'default' },
        ) as unknown as ComposeMailArgs['db']
        const composed = composeMail({
            db,
            env: { MAIL_ENCRYPTION_KEY: 'test-encryption-key' } as unknown as ComposeMailArgs['env'],
            storageService: {} as unknown as ComposeMailArgs['storageService'],
        })

        await composed.mailMessageDb.search({ q: 'hello', accountId: 1, userId: 'user-1', page: 1, limit: 20 })
        expect(probeQueries).toHaveLength(1)
        expect(searchQueries.some((sql) => sql.includes('LIKE'))).toBe(true)

        shouldProbeFail = false
        await composed.mailMessageDb.search({ q: 'hello', accountId: 1, userId: 'user-1', page: 1, limit: 20 })
        expect(probeQueries).toHaveLength(2)
        expect(searchQueries.some((sql) => sql.includes('MATCH'))).toBe(true)
    })
})
