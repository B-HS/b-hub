import { S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getDb } from './db/index'
import * as schema from './db/schema'
import { and, desc, eq, gte, inArray, isNull, like, lte, sql } from 'drizzle-orm'
import { createAuthProvider } from './service/shared/auth-provider'
import { createApiTokenService } from './service/shared/api-token'
import { createPostService } from './service/domain/blog/post'
import { createCommentService } from './service/domain/blog/comment'
import { createMessageService } from './service/domain/blog/message'
import { createBlogImageService } from './service/domain/blog/blog-image'
import { createStorageService } from './service/shared/storage'
import { createImageProcessor } from './service/shared/image-processor'
import { createImageGenerator } from './service/shared/image-generator'
import { createFontLoader } from './service/shared/font-loader'
import { createHnFetcherService } from './service/domain/hn/hn-fetcher'
import { createHnDigestService } from './service/domain/hn/hn-digest'
import { createHnWebhookService } from './service/domain/hn/hn-webhook'
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const compose = () => {
    const db = getDb()

    const auth = createAuthProvider({
        db,
        baseUrl: process.env.BASE_URL ?? 'http://localhost:9999',
        githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
        githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
        secret: process.env.BETTER_AUTH_SECRET,
        trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',') ?? ['https://blog.gumyo.net', 'http://localhost:3000'],
    })

    const getSession = async (c: { req: { raw: { headers: Headers } } }) => {
        const session = await auth.api.getSession({ headers: c.req.raw.headers })
        if (!session) return null
        return {
            user: {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                role: (session.user as Record<string, unknown>).role as string | null,
                image: session.user.image ?? null,
            },
        }
    }

    const apiTokenService = createApiTokenService({ db })

    const postService = createPostService({
        db: {
            getPostList: async (params) => {
                const { posts, categories, postTags, tags } = schema

                const tagsSubquery = db
                    .select({
                        postId: postTags.postId,
                        tags: sql<string>`JSON_ARRAYAGG(JSON_OBJECT('tagId', ${tags.tagId}, 'tag', ${tags.tag}))`.as('tags'),
                    })
                    .from(postTags)
                    .leftJoin(tags, eq(postTags.tagId, tags.tagId))
                    .groupBy(postTags.postId)
                    .as('post_tags_agg')

                let query = db
                    .select({
                        postId: posts.postId,
                        categoryId: posts.categoryId,
                        categoryName: categories.category,
                        title: posts.title,
                        description: posts.description,
                        updatedAt: posts.updatedAt,
                        createdAt: posts.createdAt,
                        views: posts.views,
                        isPublished: posts.isPublished,
                        isHide: posts.isHide,
                        isNotice: posts.isNotice,
                        isComment: posts.isComment,
                        tags: sql<{ tagId: number; tag: string }[]>`COALESCE(${tagsSubquery.tags}, JSON_ARRAY())`,
                    })
                    .from(posts)
                    .leftJoin(categories, eq(posts.categoryId, categories.categoryId))
                    .leftJoin(tagsSubquery, eq(posts.postId, tagsSubquery.postId))
                    .$dynamic()

                const conditions = []

                if (params.keyword) conditions.push(like(posts.title, `%${params.keyword}%`))
                if (params.categoryId) conditions.push(eq(posts.categoryId, params.categoryId))
                if (params.tagId) {
                    query = query.leftJoin(postTags, eq(posts.postId, postTags.postId))
                    conditions.push(eq(postTags.tagId, params.tagId))
                }
                if (params.isPublished !== undefined) conditions.push(eq(posts.isPublished, params.isPublished))
                if (params.isHide !== undefined) conditions.push(eq(posts.isHide, params.isHide))
                if (params.isNotice !== undefined) conditions.push(eq(posts.isNotice, params.isNotice))

                if (conditions.length > 0) query = query.where(and(...conditions))

                const data = await query.orderBy(desc(posts.createdAt), desc(posts.postId)).limit(params.limit).offset(params.offset)

                let countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(posts).$dynamic()
                if (params.tagId) countQuery = countQuery.leftJoin(postTags, eq(posts.postId, postTags.postId))
                if (conditions.length > 0) countQuery = countQuery.where(and(...conditions))
                const [{ count }] = await countQuery

                return { data, total: count }
            },

            getPostById: async (id) => {
                const { posts, categories, postTags, tags } = schema
                const tagsSubquery = db
                    .select({
                        postId: postTags.postId,
                        tags: sql<string>`JSON_ARRAYAGG(JSON_OBJECT('tagId', ${tags.tagId}, 'tag', ${tags.tag}))`.as('tags'),
                    })
                    .from(postTags)
                    .leftJoin(tags, eq(postTags.tagId, tags.tagId))
                    .groupBy(postTags.postId)
                    .as('post_tags_agg')

                const [post] = await db
                    .select({
                        postId: posts.postId,
                        categoryId: posts.categoryId,
                        categoryName: categories.category,
                        title: posts.title,
                        description: posts.description,
                        updatedAt: posts.updatedAt,
                        createdAt: posts.createdAt,
                        views: posts.views,
                        isPublished: posts.isPublished,
                        isHide: posts.isHide,
                        isNotice: posts.isNotice,
                        isComment: posts.isComment,
                        tags: sql<{ tagId: number; tag: string }[]>`COALESCE(${tagsSubquery.tags}, JSON_ARRAY())`,
                    })
                    .from(posts)
                    .leftJoin(categories, eq(posts.categoryId, categories.categoryId))
                    .leftJoin(tagsSubquery, eq(posts.postId, tagsSubquery.postId))
                    .where(eq(posts.postId, id))
                    .limit(1)

                return post ?? null
            },

            insertPost: async (data) => {
                const { posts, postTags } = schema
                const [post] = await db
                    .insert(posts)
                    .values({
                        title: data.title,
                        description: data.description,
                        categoryId: data.categoryId,
                        isPublished: data.isPublished,
                        updatedAt: new Date(),
                        createdAt: new Date(),
                    })
                    .$returningId()

                if (data.tagIds.length > 0) {
                    await db.insert(postTags).values(data.tagIds.map((tagId) => ({ postId: post.postId, tagId })))
                }
                return post
            },

            updatePost: async (postId, data) => {
                const { posts, postTags } = schema
                const updateData: Record<string, unknown> = { updatedAt: new Date() }
                if (data.title !== undefined) updateData.title = data.title
                if (data.description !== undefined) updateData.description = data.description
                if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
                if (data.isPublished !== undefined) updateData.isPublished = data.isPublished
                if (data.isHide !== undefined) updateData.isHide = data.isHide
                if (data.isNotice !== undefined) updateData.isNotice = data.isNotice
                if (data.isComment !== undefined) updateData.isComment = data.isComment

                await db.update(posts).set(updateData).where(eq(posts.postId, postId))

                if (data.tagIds !== undefined) {
                    await db.delete(postTags).where(eq(postTags.postId, postId))
                    if (data.tagIds.length > 0) {
                        await db.insert(postTags).values(data.tagIds.map((tagId) => ({ postId, tagId })))
                    }
                }
                return { postId }
            },

            deletePost: async (postId) => {
                await db.delete(schema.posts).where(eq(schema.posts.postId, postId))
                return { postId }
            },

            incrementViews: async (postId) => {
                await db
                    .update(schema.posts)
                    .set({ views: sql`${schema.posts.views} + 1` })
                    .where(eq(schema.posts.postId, postId))
            },
        },
    })

    const commentService = createCommentService({
        db: {
            getCommentsByPostId: async (postId) => {
                const { comments, user } = schema
                const data = await db
                    .select({
                        commentId: comments.commentId,
                        postId: comments.postId,
                        userId: comments.userId,
                        comment: comments.comment,
                        updatedAt: comments.updatedAt,
                        createdAt: comments.createdAt,
                        isHide: comments.isHide,
                        userName: user.name,
                        userImage: user.image,
                    })
                    .from(comments)
                    .leftJoin(user, eq(comments.userId, user.id))
                    .where(eq(comments.postId, postId))
                    .orderBy(desc(comments.createdAt))

                return data.map((c) => ({
                    ...c,
                    userName: c.userName ?? '',
                    comment: c.isHide ? '' : c.comment,
                }))
            },

            getCommentById: async (commentId) => {
                const { comments, user } = schema
                const [comment] = await db
                    .select({
                        commentId: comments.commentId,
                        postId: comments.postId,
                        userId: comments.userId,
                        comment: comments.comment,
                        updatedAt: comments.updatedAt,
                        createdAt: comments.createdAt,
                        isHide: comments.isHide,
                        userName: user.name,
                        userImage: user.image,
                    })
                    .from(comments)
                    .leftJoin(user, eq(comments.userId, user.id))
                    .where(eq(comments.commentId, commentId))
                    .limit(1)

                if (!comment) return null
                return { ...comment, userName: comment.userName ?? '' }
            },

            insertComment: async (data) => {
                const [comment] = await db
                    .insert(schema.comments)
                    .values({
                        postId: data.postId,
                        userId: data.userId,
                        comment: data.comment,
                        isHide: data.isHide,
                        updatedAt: new Date(),
                        createdAt: new Date(),
                    })
                    .$returningId()
                return comment
            },

            updateComment: async (commentId, data) => {
                const updateData: Record<string, unknown> = { updatedAt: new Date() }
                if (data.comment !== undefined) updateData.comment = data.comment
                if (data.isHide !== undefined) updateData.isHide = data.isHide
                await db.update(schema.comments).set(updateData).where(eq(schema.comments.commentId, commentId))
            },

            deleteComment: async (commentId) => {
                await db.delete(schema.comments).where(eq(schema.comments.commentId, commentId))
            },
        },
    })

    const messageService = createMessageService({
        db: {
            getUserProfile: async (userId) => {
                const { user, follows } = schema
                const [result] = await db
                    .select({
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        image: user.image,
                        followersCount: sql<number>`(SELECT COUNT(*) FROM ${follows} WHERE ${follows.followingId} = ${user.id})`,
                        followingCount: sql<number>`(SELECT COUNT(*) FROM ${follows} WHERE ${follows.followerId} = ${user.id})`,
                    })
                    .from(user)
                    .where(eq(user.id, userId))
                    .limit(1)

                return result ?? null
            },

            getMessagesByUserId: async ({ userId, page, size }) => {
                const { messages, user, messageImages, imageAssets } = schema
                const offset = (page - 1) * size

                const data = await db
                    .select({
                        id: messages.id,
                        userId: messages.userId,
                        body: messages.body,
                        replyToId: messages.replyToId,
                        retweetOfId: messages.retweetOfId,
                        createdAt: messages.createdAt,
                        updatedAt: messages.updatedAt,
                        deletedAt: messages.deletedAt,
                        userName: user.name,
                        userImage: user.image,
                    })
                    .from(messages)
                    .leftJoin(user, eq(messages.userId, user.id))
                    .where(and(eq(messages.userId, userId), isNull(messages.deletedAt)))
                    .orderBy(desc(messages.createdAt))
                    .limit(size)
                    .offset(offset)

                const [{ total }] = await db
                    .select({ total: sql<number>`COUNT(*)` })
                    .from(messages)
                    .where(and(eq(messages.userId, userId), isNull(messages.deletedAt)))

                const totalPages = Math.ceil(total / size)

                const content = await Promise.all(
                    data.map(async (msg) => {
                        const imgs = await db
                            .select({
                                id: imageAssets.id,
                                r2Key: imageAssets.r2Key,
                                mimeType: imageAssets.mimeType,
                                width: imageAssets.width,
                                height: imageAssets.height,
                            })
                            .from(messageImages)
                            .leftJoin(imageAssets, eq(messageImages.imageId, imageAssets.id))
                            .where(eq(messageImages.messageId, msg.id))

                        return {
                            id: msg.id,
                            userId: msg.userId,
                            body: msg.body,
                            replyToId: msg.replyToId,
                            retweetOfId: msg.retweetOfId,
                            createdAt: msg.createdAt,
                            updatedAt: msg.updatedAt,
                            deletedAt: msg.deletedAt,
                            images: imgs.map((i) => ({
                                id: i.id!,
                                url: `https://blogimg.gumyo.net/${i.r2Key}`,
                                mimeType: i.mimeType!,
                                width: i.width,
                                height: i.height,
                            })),
                            user: {
                                id: msg.userId,
                                name: msg.userName ?? '',
                                image: msg.userImage,
                            },
                        }
                    }),
                )

                return {
                    content,
                    totalElements: total,
                    totalPages,
                    prev: page > 1 ? page - 1 : null,
                    next: page < totalPages ? page + 1 : null,
                }
            },

            insertMessage: async (data) => {
                const messageId = crypto.randomUUID()
                await db.insert(schema.messages).values({
                    id: messageId,
                    userId: data.userId,
                    body: data.body,
                    replyToId: data.replyToId,
                    retweetOfId: data.retweetOfId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                if (data.imageIds.length > 0) {
                    await db.insert(schema.messageImages).values(
                        data.imageIds.map((imageId, index) => ({
                            messageId,
                            imageId,
                            order: index,
                            createdAt: new Date(),
                        })),
                    )
                }
                return { id: messageId }
            },

            deleteMessage: async (messageId) => {
                await db.update(schema.messages).set({ deletedAt: new Date() }).where(eq(schema.messages.id, messageId))
                return { id: messageId }
            },

            getMessageById: async (messageId) => {
                const { messages, user, messageImages, imageAssets } = schema
                const [msg] = await db
                    .select({
                        id: messages.id,
                        userId: messages.userId,
                        body: messages.body,
                        replyToId: messages.replyToId,
                        retweetOfId: messages.retweetOfId,
                        createdAt: messages.createdAt,
                        updatedAt: messages.updatedAt,
                        deletedAt: messages.deletedAt,
                        userName: user.name,
                        userImage: user.image,
                    })
                    .from(messages)
                    .leftJoin(user, eq(messages.userId, user.id))
                    .where(eq(messages.id, messageId))
                    .limit(1)

                if (!msg) return null

                const imgs = await db
                    .select({
                        id: imageAssets.id,
                        r2Key: imageAssets.r2Key,
                        mimeType: imageAssets.mimeType,
                        width: imageAssets.width,
                        height: imageAssets.height,
                    })
                    .from(messageImages)
                    .leftJoin(imageAssets, eq(messageImages.imageId, imageAssets.id))
                    .where(eq(messageImages.messageId, messageId))

                return {
                    id: msg.id,
                    userId: msg.userId,
                    body: msg.body,
                    replyToId: msg.replyToId,
                    retweetOfId: msg.retweetOfId,
                    createdAt: msg.createdAt,
                    updatedAt: msg.updatedAt,
                    deletedAt: msg.deletedAt,
                    images: imgs.map((i) => ({
                        id: i.id!,
                        url: `https://blogimg.gumyo.net/${i.r2Key}`,
                        mimeType: i.mimeType!,
                        width: i.width,
                        height: i.height,
                    })),
                    user: {
                        id: msg.userId,
                        name: msg.userName ?? '',
                        image: msg.userImage,
                    },
                }
            },
        },
    })

    const s3 = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_END_POINT,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
    })

    const storageService = createStorageService({
        s3,
        bucket: process.env.R2_BUCKET ?? 'blog-cloud',
        cdnDomain: process.env.R2_CUSTOME_DOMAIN ?? 'https://blogimg.gumyo.net',
    })

    const imageProcessor = createImageProcessor({ sharp })

    const blogImageService = createBlogImageService({
        storage: {
            upload: async (key, body, contentType) => {
                await storageService.upload(key, body, contentType)
            },
            delete: storageService.del,
            getUrl: storageService.getUrl,
        },
        imageProcessor,
        db: {
            insertImageAsset: async (data) => {
                await db.insert(schema.imageAssets).values({
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            },
            getImageList: async () => {
                return db.select().from(schema.images).orderBy(desc(schema.images.createdAt))
            },
            insertLegacyImage: async (data) => {
                const [image] = await db
                    .insert(schema.images)
                    .values({
                        ...data,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .$returningId()
                return image
            },
        },
        bucket: process.env.R2_BUCKET ?? 'blog-cloud',
        generateId: () => crypto.randomUUID(),
    })

    const categoryDb = {
        getCategoryList: async () => {
            return db.select().from(schema.categories).where(eq(schema.categories.isHide, false))
        },
        createCategory: async (category: string) => {
            const [result] = await db.insert(schema.categories).values({ category, isHide: false }).$returningId()
            const [newCategory] = await db.select().from(schema.categories).where(eq(schema.categories.categoryId, result.categoryId))
            return newCategory
        },
    }

    const tagDb = {
        getTagList: async () => {
            return db.select().from(schema.tags)
        },
        createTag: async (tag: string) => {
            const [result] = await db.insert(schema.tags).values({ tag }).$returningId()
            const [newTag] = await db.select().from(schema.tags).where(eq(schema.tags.tagId, result.tagId))
            return newTag
        },
    }

    const adminDb = {
        getAllUsers: async () => {
            const { user: u, posts, comments } = schema
            return db
                .select({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    image: u.image,
                    role: u.role,
                    createdAt: u.createdAt,
                    postsCount: sql<number>`0`,
                    commentsCount: sql<number>`(SELECT COUNT(*) FROM ${comments} WHERE ${comments.userId} = ${u.id})`,
                })
                .from(u)
                .orderBy(desc(u.createdAt))
        },
        getAllPosts: async () => {
            const { posts, categories } = schema
            return db
                .select({
                    postId: posts.postId,
                    categoryId: posts.categoryId,
                    categoryName: categories.category,
                    title: posts.title,
                    isPublished: posts.isPublished,
                    isHide: posts.isHide,
                    createdAt: posts.createdAt,
                })
                .from(posts)
                .leftJoin(categories, eq(posts.categoryId, categories.categoryId))
                .orderBy(desc(posts.createdAt))
        },
        getAllComments: async () => {
            const { comments, posts, user } = schema
            const data = await db
                .select({
                    commentId: comments.commentId,
                    postId: comments.postId,
                    postTitle: posts.title,
                    userId: comments.userId,
                    userName: user.name,
                    comment: comments.comment,
                    isHide: comments.isHide,
                    createdAt: comments.createdAt,
                })
                .from(comments)
                .leftJoin(posts, eq(comments.postId, posts.postId))
                .leftJoin(user, eq(comments.userId, user.id))
                .orderBy(desc(comments.createdAt))
            return data.map((c) => ({
                ...c,
                postTitle: c.postTitle ?? '',
                userName: c.userName ?? '',
            }))
        },
        deleteUser: async (userId: string) => {
            await db.delete(schema.user).where(eq(schema.user.id, userId))
            return { id: userId }
        },
    }

    const hnStoryDb = {
        getStoriesPaginated: async (type: string | undefined, limit: number, offset: number) => {
            const { hnStories } = schema
            let query = db.select().from(hnStories).$dynamic()
            if (type) query = query.where(eq(hnStories.type, type))
            return query.orderBy(desc(hnStories.time)).limit(limit).offset(offset)
        },
        getStoryById: async (id: number) => {
            const [story] = await db.select().from(schema.hnStories).where(eq(schema.hnStories.id, id)).limit(1)
            return story ?? null
        },
        getSummariesByStoryIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.hnSummaries).where(inArray(schema.hnSummaries.storyId, ids))
        },
        getSummaryByStoryId: async (id: number) => {
            const [summary] = await db.select().from(schema.hnSummaries).where(eq(schema.hnSummaries.storyId, id)).limit(1)
            return summary ?? null
        },
        getCommentsByStoryId: async (id: number) => {
            return db
                .select()
                .from(schema.hnComments)
                .where(eq(schema.hnComments.storyId, id))
                .orderBy(schema.hnComments.depth, schema.hnComments.time)
        },
        getAllTags: async () => {
            return db.select().from(schema.hnTags).orderBy(desc(schema.hnTags.usageCount))
        },
        getStoriesByTagName: async (name: string, limit: number, offset: number) => {
            const stories = await db
                .select()
                .from(schema.hnStories)
                .where(sql`JSON_CONTAINS(${schema.hnStories.tags}, ${JSON.stringify(name)})`)
                .orderBy(desc(schema.hnStories.score))
                .limit(limit)
                .offset(offset)

            const storyIds = stories.map((s) => s.id)
            const summaries = storyIds.length > 0 ? await db.select().from(schema.hnSummaries).where(inArray(schema.hnSummaries.storyId, storyIds)) : []

            return { stories, summaries }
        },
        searchStories: async (q: string, limit: number) => {
            return db.select().from(schema.hnStories).where(like(schema.hnStories.title, `%${q}%`)).orderBy(desc(schema.hnStories.score)).limit(limit)
        },
        getStoryCounts: async () => {
            const types = ['top', 'new', 'best'] as const
            const results = await Promise.all(
                types.map(async (type) => {
                    const [result] = await db
                        .select({ count: sql<number>`count(*)` })
                        .from(schema.hnStories)
                        .where(eq(schema.hnStories.type, type))
                    return { type, count: result?.count ?? 0 }
                }),
            )
            return results
        },
    }

    const hnDigestDb = {
        getDigestsByType: async (type: string, limit: number) => {
            return db.select().from(schema.hnDigests).where(eq(schema.hnDigests.digestType, type)).orderBy(desc(schema.hnDigests.createdAt)).limit(limit)
        },
        getDigestByTypeAndKey: async (type: string, key: string) => {
            const [digest] = await db
                .select()
                .from(schema.hnDigests)
                .where(and(eq(schema.hnDigests.digestType, type), eq(schema.hnDigests.digestKey, key)))
                .limit(1)
            return digest ?? null
        },
        getStoriesByIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.hnStories).where(inArray(schema.hnStories.id, ids))
        },
        getSummariesByStoryIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.hnSummaries).where(inArray(schema.hnSummaries.storyId, ids))
        },
    }

    const hnFetcherDb = {
        ...hnStoryDb,
        getExistingStoryIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db
                .select({ id: schema.hnStories.id, score: schema.hnStories.score, descendants: schema.hnStories.descendants })
                .from(schema.hnStories)
                .where(inArray(schema.hnStories.id, ids))
        },
        upsertStory: async (data: Record<string, unknown>) => {
            await db
                .insert(schema.hnStories)
                .values(data as never)
                .onDuplicateKeyUpdate({ set: data as never })
        },
        updateStoryMeta: async (id: number, data: { score: number; descendants: number; needsResummarize: boolean }) => {
            await db.update(schema.hnStories).set(data).where(eq(schema.hnStories.id, id))
        },
        deleteCommentsByStoryId: async (storyId: number) => {
            await db.delete(schema.hnComments).where(eq(schema.hnComments.storyId, storyId))
        },
        insertCommentsBatch: async (commentsList: Record<string, unknown>[]) => {
            if (commentsList.length === 0) return
            await db.insert(schema.hnComments).values(commentsList as never)
        },
        getUnsummarizedStories: async (limit: number) => {
            return db
                .select()
                .from(schema.hnStories)
                .where(eq(schema.hnStories.needsResummarize, true))
                .orderBy(desc(schema.hnStories.score))
                .limit(limit)
        },
        getStoriesForPeriod: async (startTime: number, endTime: number, limit: number) => {
            return db
                .select()
                .from(schema.hnStories)
                .where(and(gte(schema.hnStories.time, startTime), lte(schema.hnStories.time, endTime)))
                .orderBy(desc(schema.hnStories.score))
                .limit(limit)
        },
        markStorySummarized: async (storyId: number) => {
            await db.update(schema.hnStories).set({ needsResummarize: false }).where(eq(schema.hnStories.id, storyId))
        },
    }

    const hnDigestServiceDb = {
        getUnsummarizedStories: hnFetcherDb.getUnsummarizedStories,
        getCommentsByStoryId: hnStoryDb.getCommentsByStoryId,
        saveSummary: async (storyId: number, summary: string, summaryTags: string[], summaryType: string) => {
            await db
                .insert(schema.hnSummaries)
                .values({ storyId, summary, tags: summaryTags, summaryType })
                .onDuplicateKeyUpdate({ set: { summary, tags: summaryTags, summaryType } })
        },
        markStorySummarized: hnFetcherDb.markStorySummarized,
        getSummaryByStoryId: hnStoryDb.getSummaryByStoryId,
        getRecentSummaries: async (summaryType: string, limit: number) => {
            return db
                .select()
                .from(schema.hnSummaries)
                .where(eq(schema.hnSummaries.summaryType, summaryType))
                .orderBy(desc(schema.hnSummaries.createdAt))
                .limit(limit)
        },
        getStoriesByIds: hnDigestDb.getStoriesByIds,
        upsertDigest: async (data: { digestType: string; digestKey: string; title: string; content: string; storyIds: number[] }) => {
            await db
                .insert(schema.hnDigests)
                .values(data)
                .onDuplicateKeyUpdate({ set: { content: data.content, storyIds: data.storyIds } })
        },
        getStoriesForPeriod: hnFetcherDb.getStoriesForPeriod,
        getSummariesByStoryIds: hnDigestDb.getSummariesByStoryIds,
    }

    const hnWebhookDb = {
        getActiveWebhooks: async (digestType: string) => {
            const list = await db
                .select()
                .from(schema.hnWebhooks)
                .where(eq(schema.hnWebhooks.isActive, true))

            return list
                .filter((w) => (w.digestTypes ?? []).includes(digestType))
                .map((w) => ({ id: w.id, provider: w.provider, url: w.url, name: w.name, digestTypes: w.digestTypes }))
        },
        getWebhookById: async (id: number) => {
            const [webhook] = await db.select().from(schema.hnWebhooks).where(eq(schema.hnWebhooks.id, id)).limit(1)
            return webhook ? { id: webhook.id, provider: webhook.provider, url: webhook.url, name: webhook.name } : null
        },
        registerWebhook: async (data: { url: string; name?: string; provider: string; digestTypes: string[] }) => {
            await db.insert(schema.hnWebhooks).values({
                url: data.url,
                name: data.name ?? null,
                provider: data.provider,
                digestTypes: data.digestTypes,
            })
        },
        deactivateWebhook: async (id: number) => {
            await db.update(schema.hnWebhooks).set({ isActive: false }).where(eq(schema.hnWebhooks.id, id))
        },
        deleteWebhook: async (id: number) => {
            await db.delete(schema.hnWebhooks).where(eq(schema.hnWebhooks.id, id))
        },
        listWebhooks: async () => {
            return db.select().from(schema.hnWebhooks)
        },
        webhookExists: async (url: string) => {
            const [existing] = await db.select().from(schema.hnWebhooks).where(eq(schema.hnWebhooks.url, url)).limit(1)
            return !!existing
        },
        logWebhook: async (data: {
            webhookId: number
            provider: string
            digestType: string
            status: string
            payload: Record<string, unknown>
            response: string
        }) => {
            await db.insert(schema.hnWebhookLogs).values(data)
        },
        deleteWebhooksByUrl: async (url: string) => {
            const existing = await db.select().from(schema.hnWebhooks).where(eq(schema.hnWebhooks.url, url))
            for (const webhook of existing) {
                await db.delete(schema.hnWebhooks).where(eq(schema.hnWebhooks.id, webhook.id))
            }
            return existing.length
        },
    }

    let genai: InstanceType<typeof import('@google/genai').GoogleGenAI> | null = null

    const getGenAI = async () => {
        if (!genai) {
            const { GoogleGenAI } = await import('@google/genai')
            genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' })
        }
        return genai
    }

    const hnAi = {
        summarize: async (prompt: string) => {
            const ai = await getGenAI()
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-lite',
                contents: prompt,
            })
            return response.text ?? ''
        },
    }

    const hnFetcher = createHnFetcherService({ db: hnFetcherDb })
    const hnDigest = createHnDigestService({ ai: hnAi, db: hnDigestServiceDb })
    const hnWebhook = createHnWebhookService({ db: hnWebhookDb })

    const fontLoader = createFontLoader()

    const basePath = process.env.VERCEL ? '/var/task' : process.cwd()
    const wasmPath = join(basePath, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')

    const imageGenerator = createImageGenerator({
        satori: satori as never,
        initWasm: initWasm as never,
        Resvg: Resvg as never,
        loadWasm: () => readFile(wasmPath).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
    })

    return {
        auth,
        getSession,
        apiTokenService,
        postService,
        commentService,
        messageService,
        blogImageService,
        categoryDb,
        tagDb,
        adminDb,
        imageGenerator,
        fontLoader,
        hnStoryDb,
        hnDigestDb,
        hnFetcher,
        hnDigest,
        hnWebhook,
        cronSecret: process.env.CRON_SECRET ?? '',
    }
}
