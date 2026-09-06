import { describe, expect, test, mock } from 'bun:test'
import { getTableName, sql } from 'drizzle-orm'
import { composeBlog } from '../../compose/blog'

const IMAGE_UUID_A = '3f7d6f2c-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const IMAGE_UUID_B = '9c1e0b74-55aa-4b1c-9d2e-7f6a5b4c3d2e'

type InsertedValues = { table: unknown; values: unknown }

const createFakeDb = (options: { failOnSecondInsert?: boolean } = {}) => {
    const inserted: InsertedValues[] = []
    let transactionCalls = 0
    let committed = false
    const tx = {
        insert: (table: unknown) => ({
            values: async (values: unknown) => {
                if (options.failOnSecondInsert && inserted.length === 1) throw new Error('image insert failed')
                inserted.push({ table, values })
            },
        }),
    }
    const db = {
        insert: () => {
            throw new Error('insert outside transaction')
        },
        transaction: async (fn: (t: typeof tx) => Promise<void>) => {
            transactionCalls += 1
            await fn(tx)
            committed = true
        },
    }
    return { db, inserted, stats: () => ({ transactionCalls, committed }) }
}

const createServices = (db: unknown) =>
    composeBlog({
        db: db as never,
        env: { R2_BUCKET: 'test-bucket', UPLOAD_SERVER_SECRET: 'secret', UPLOAD_SERVER_URL: 'https://upload.test' } as never,
        storageService: { getUrl: (key: string) => `https://cdn.test/${key}`, upload: mock(async () => {}), del: mock(async () => {}) } as never,
        imageProcessor: {} as never,
    })

describe('composeBlog messageDb.insertMessage', () => {
    test('메시지와 이미지 연결을 하나의 트랜잭션 안에서 저장한다', async () => {
        const fake = createFakeDb()
        const { messageService } = createServices(fake.db)

        const result = await messageService.create('user-1', {
            body: 'hello',
            imageIds: [IMAGE_UUID_A, IMAGE_UUID_B],
            replyToId: null,
            retweetOfId: null,
        })

        expect(fake.stats().transactionCalls).toBe(1)
        expect(fake.stats().committed).toBe(true)
        expect(fake.inserted).toHaveLength(2)
        const message = fake.inserted[0].values as { id: string; userId: string; body: string }
        expect(message.id).toBe(result.id)
        expect(message.userId).toBe('user-1')
        const links = fake.inserted[1].values as { messageId: string; imageId: string; order: number }[]
        expect(links).toEqual([
            { messageId: result.id, imageId: IMAGE_UUID_A, order: 0, createdAt: expect.any(Date) },
            { messageId: result.id, imageId: IMAGE_UUID_B, order: 1, createdAt: expect.any(Date) },
        ])
    })

    test('이미지가 없으면 메시지만 저장한다', async () => {
        const fake = createFakeDb()
        const { messageService } = createServices(fake.db)

        await messageService.create('user-1', { body: 'hello', imageIds: [], replyToId: null, retweetOfId: null })

        expect(fake.inserted).toHaveLength(1)
    })

    test('이미지 연결 저장이 실패하면 트랜잭션이 커밋되지 않고 throw 한다(고아 메시지 방지)', async () => {
        const fake = createFakeDb({ failOnSecondInsert: true })
        const { messageService } = createServices(fake.db)

        await expect(
            messageService.create('user-1', { body: 'hello', imageIds: [IMAGE_UUID_A], replyToId: null, retweetOfId: null }),
        ).rejects.toThrow('image insert failed')
        expect(fake.stats().committed).toBe(false)
    })
})

const mockPostRow = {
    postId: 1,
    categoryId: 1,
    categoryName: 'Tech',
    title: 'Test',
    description: 'Content',
    updatedAt: new Date(),
    createdAt: new Date(),
    views: 0,
    isPublished: true,
    isHide: false,
    isNotice: false,
    isComment: true,
    tags: [],
}

const createQueryChain = (rows: unknown[]) => {
    const chain = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        groupBy: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        offset: () => chain,
        $dynamic: () => chain,
        as: () => ({ postId: sql`post_id`, tags: sql`tags` }),
        then: (resolve: (value: unknown[]) => void) => resolve(rows),
    }
    return chain
}

const createFakePostDb = () => {
    const deletedTables: string[] = []
    let transactionCalls = 0
    const tx = {
        delete: (table: unknown) => ({
            where: async () => {
                const name = getTableName(table as never)
                if (name === 'posts' && !deletedTables.includes('comments')) throw new Error('FOREIGN KEY constraint fails (comments)')
                deletedTables.push(name)
            },
        }),
    }
    const db = {
        select: () => createQueryChain([mockPostRow]),
        delete: () => {
            throw new Error('delete outside transaction')
        },
        transaction: async (fn: (t: typeof tx) => Promise<void>) => {
            transactionCalls += 1
            await fn(tx)
        },
    }
    return { db, deletedTables, stats: () => ({ transactionCalls }) }
}

describe('composeBlog postDb.deletePost', () => {
    test('댓글을 먼저 지운 뒤 게시글을 같은 트랜잭션에서 삭제한다 (FK 500 방지)', async () => {
        const fake = createFakePostDb()
        const { postService } = createServices(fake.db)

        const result = await postService.delete(1)

        expect(result).toEqual({ postId: 1 })
        expect(fake.stats().transactionCalls).toBe(1)
        expect(fake.deletedTables).toEqual(['comments', 'posts'])
    })
})
