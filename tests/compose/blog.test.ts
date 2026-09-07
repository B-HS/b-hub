import { describe, expect, test, mock } from 'bun:test'
import { getTableName, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql-proxy'
import * as schema from '../../db/schema'
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

describe('composeBlog commentDb.getPostCommentFlag', () => {
    test('게시글이 없으면 댓글 생성이 post_not_found 로 막힌다', async () => {
        const { commentService } = createServices(createQueryChain([]))

        const result = await commentService.create('user-1', { postId: 999, comment: '안녕하세요', isHide: false })

        expect(result.success).toBe(false)
        expect(!result.success && result.reason).toBe('post_not_found')
    })

    test('isComment 가 false 면 댓글 생성이 comment_disabled 로 막힌다', async () => {
        const { commentService } = createServices(createQueryChain([{ isComment: false }]))

        const result = await commentService.create('user-1', { postId: 1, comment: '안녕하세요', isHide: false })

        expect(result.success).toBe(false)
        expect(!result.success && result.reason).toBe('comment_disabled')
    })
})

type ComposeBlogArgs = Parameters<typeof composeBlog>[0]

const createRecordingCompose = (respond: (sqlText: string) => unknown[]) => {
    const queries: { sql: string; params: unknown[] }[] = []
    let inFlight = 0
    let maxInFlight = 0

    const db = drizzle(
        async (sqlText, params) => {
            queries.push({ sql: sqlText, params })
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 0))
            inFlight -= 1
            return { rows: respond(sqlText) }
        },
        { schema, mode: 'default' },
    ) as unknown as ComposeBlogArgs['db']

    const composed = composeBlog({
        db,
        env: {
            R2_BUCKET: 'test-bucket',
            UPLOAD_SERVER_SECRET: 'secret',
            UPLOAD_SERVER_URL: 'https://upload.test',
        } as unknown as ComposeBlogArgs['env'],
        storageService: {
            getUrl: (key: string) => `https://cdn.test/${key}`,
            upload: mock(async () => {}),
            del: mock(async () => {}),
        } as unknown as ComposeBlogArgs['storageService'],
        imageProcessor: {} as unknown as ComposeBlogArgs['imageProcessor'],
    })

    return { composed, queries, stats: () => ({ maxInFlight }) }
}

const POST_LIST_ROW = [1, 2, 'Tech', 'Test', 'Content', null, null, 0, 1, 0, 0, 1, [{ tagId: 1, tag: 'TypeScript' }]]

const respondPostList = (sqlText: string) => (sqlText.includes('COUNT(*)') ? [[7]] : [POST_LIST_ROW])

const findListQuery = (queries: { sql: string; params: unknown[] }[]) => queries.find((query) => !query.sql.includes('COUNT(*)'))!

describe('composeBlog postDb.getPostList', () => {
    test('목록과 총 개수를 병렬로 조회한다', async () => {
        const { composed, queries, stats } = createRecordingCompose(respondPostList)

        const result = await composed.postService.list({ page: 2, limit: 12 })

        expect(queries).toHaveLength(2)
        expect(stats().maxInFlight).toBe(2)
        expect(result.total).toBe(7)
        expect(result.page).toBe(2)
        expect(result.limit).toBe(12)
    })

    test('응답 행의 필드 순서와 값이 그대로 유지된다', async () => {
        const { composed } = createRecordingCompose(respondPostList)

        const result = await composed.postService.list({ page: 1, limit: 12 })

        expect(Object.keys(result.data[0])).toEqual([
            'postId',
            'categoryId',
            'categoryName',
            'title',
            'description',
            'updatedAt',
            'createdAt',
            'views',
            'isPublished',
            'isHide',
            'isNotice',
            'isComment',
            'tags',
        ])
        expect(result.data[0]).toEqual({
            postId: 1,
            categoryId: 2,
            categoryName: 'Tech',
            title: 'Test',
            description: 'Content',
            updatedAt: null,
            createdAt: null,
            views: 0,
            isPublished: true,
            isHide: false,
            isNotice: false,
            isComment: true,
            tags: [{ tagId: 1, tag: 'TypeScript' }],
        } as never)
    })

    test('태그 집계가 전체 테이블 파생 테이블이 아니라 게시글 상관 서브쿼리다', async () => {
        const { composed, queries } = createRecordingCompose(respondPostList)

        await composed.postService.list({ page: 1, limit: 12 })
        const listSql = findListQuery(queries).sql

        expect(listSql).not.toContain('post_tags_agg')
        expect(listSql).toContain('WHERE `post_tags`.`postId` = `posts`.`postId`')
        expect(listSql).toContain("JSON_OBJECT('tagId', `tags`.`tagId`, 'tag', `tags`.`tag`)")
        expect(listSql).toContain('COALESCE(')
    })

    test('정렬·페이지네이션 파라미터가 그대로 전달된다', async () => {
        const { composed, queries } = createRecordingCompose(respondPostList)

        await composed.postService.list({ page: 3, limit: 12 })
        const listQuery = findListQuery(queries)

        expect(listQuery.sql).toContain('`posts`.`created_at` desc')
        expect(listQuery.sql).toContain('`posts`.`postId` desc')
        expect(listQuery.params.slice(-2)).toEqual([12, 24])
    })

    test('tagId 필터는 목록·카운트 양쪽에 동일하게 적용된다', async () => {
        const { composed, queries } = createRecordingCompose(respondPostList)

        await composed.postService.list({ page: 1, limit: 12, tagId: 5 })
        const countQuery = queries.find((query) => query.sql.includes('COUNT(*)'))!

        expect(countQuery.sql).toContain('`post_tags`')
        expect(countQuery.params).toContain(5)
        expect(findListQuery(queries).params).toContain(5)
    })
})

describe('composeBlog postDb.getPostById / getPostIdById', () => {
    test('상세 조회도 상관 서브쿼리 한 번으로 태그를 집계한다', async () => {
        const { composed, queries } = createRecordingCompose(() => [POST_LIST_ROW])

        const post = await composed.postService.getByIdWithoutView(1)

        expect(queries).toHaveLength(1)
        expect(queries[0].sql).not.toContain('post_tags_agg')
        expect(queries[0].sql).toContain('WHERE `post_tags`.`postId` = `posts`.`postId`')
        expect(post!.tags).toEqual([{ tagId: 1, tag: 'TypeScript' }])
    })

    test('수정 전 존재 확인은 postId 만 읽는 경량 쿼리다', async () => {
        const { composed, queries } = createRecordingCompose(() => [])

        const result = await composed.postService.update(999, { title: 'Updated' })

        expect(result).toBeNull()
        expect(queries).toHaveLength(1)
        expect(queries[0].sql).not.toContain('JSON_ARRAYAGG')
        expect(queries[0].sql).not.toContain('left join')
        expect(queries[0].sql).toContain('`posts`.`postId`')
    })

    test('삭제 전 존재 확인도 경량 쿼리를 쓴다', async () => {
        const { composed, queries } = createRecordingCompose(() => [])

        const result = await composed.postService.delete(999)

        expect(result).toBeNull()
        expect(queries).toHaveLength(1)
        expect(queries[0].sql).not.toContain('JSON_ARRAYAGG')
    })
})

const respondMessages = (sqlText: string) => {
    if (sqlText.includes('COUNT(*)')) return [[2]]
    if (sqlText.includes('`message_images`'))
        return [
            ['m1', 'img-1', 'a.webp', 'image/webp', 10, 20],
            ['m2', 'img-2', 'b.webp', 'image/webp', null, null],
            ['m1', 'img-3', 'c.webp', 'image/webp', null, null],
        ]
    return [
        ['m1', 'u1', 'hello', null, null, null, null, null, 'User One', null],
        ['m2', 'u1', 'world', null, null, null, null, null, 'User One', null],
    ]
}

describe('composeBlog messageDb.getMessagesByUserId', () => {
    test('목록·총 개수는 병렬로, 이미지는 한 번의 IN 조회로 가져온다', async () => {
        const { composed, queries, stats } = createRecordingCompose(respondMessages)

        await composed.messageService.list('u1', 1, 10)

        expect(queries).toHaveLength(3)
        expect(stats().maxInFlight).toBe(2)
        const imageQueries = queries.filter((query) => query.sql.includes('`message_images`'))
        expect(imageQueries).toHaveLength(1)
        expect(imageQueries[0].sql).toContain('in (?, ?)')
        expect(imageQueries[0].params).toContain('m1')
        expect(imageQueries[0].params).toContain('m2')
    })

    test('일괄 조회 결과가 메시지별 이미지 배열로 그대로 매핑된다', async () => {
        const { composed } = createRecordingCompose(respondMessages)

        const result = await composed.messageService.list('u1', 1, 10)

        expect(Object.keys(result.content[0])).toEqual([
            'id',
            'userId',
            'body',
            'replyToId',
            'retweetOfId',
            'createdAt',
            'updatedAt',
            'deletedAt',
            'images',
            'user',
        ])
        expect(Object.keys(result.content[0].images[0])).toEqual(['id', 'url', 'mimeType', 'width', 'height'])
        expect(result.content[0].images).toEqual([
            { id: 'img-1', url: 'https://blogimg.gumyo.net/a.webp', mimeType: 'image/webp', width: 10, height: 20 },
            { id: 'img-3', url: 'https://blogimg.gumyo.net/c.webp', mimeType: 'image/webp', width: null, height: null },
        ])
        expect(result.content[1].images).toEqual([
            { id: 'img-2', url: 'https://blogimg.gumyo.net/b.webp', mimeType: 'image/webp', width: null, height: null },
        ])
        expect(result.totalElements).toBe(2)
        expect(result.totalPages).toBe(1)
        expect(result.prev).toBeNull()
        expect(result.next).toBeNull()
    })

    test('메시지가 없으면 이미지 쿼리를 보내지 않는다', async () => {
        const { composed, queries } = createRecordingCompose((sqlText) => (sqlText.includes('COUNT(*)') ? [[0]] : []))

        const result = await composed.messageService.list('u1', 1, 10)

        expect(result.content).toEqual([])
        expect(queries).toHaveLength(2)
        expect(queries.some((query) => query.sql.includes('`message_images`'))).toBe(false)
    })
})

describe('composeBlog categoryDb / tagDb 생성', () => {
    test('카테고리 생성은 재조회 없이 삽입된 행을 그대로 반환한다', async () => {
        const { composed, queries } = createRecordingCompose(() => [{ insertId: 7, affectedRows: 1 }])

        const result = await composed.categoryDb.createCategory('DevOps')

        expect(queries).toHaveLength(1)
        expect(Object.keys(result)).toEqual(['categoryId', 'category', 'isHide'])
        expect(result).toEqual({ categoryId: 7, category: 'DevOps', isHide: false })
    })

    test('태그 생성은 재조회 없이 삽입된 행을 그대로 반환한다', async () => {
        const { composed, queries } = createRecordingCompose(() => [{ insertId: 9, affectedRows: 1 }])

        const result = await composed.tagDb.createTag('TypeScript')

        expect(queries).toHaveLength(1)
        expect(Object.keys(result)).toEqual(['tagId', 'tag'])
        expect(result).toEqual({ tagId: 9, tag: 'TypeScript' })
    })
})
