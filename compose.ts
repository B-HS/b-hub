import { S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { getDb } from './db/index'
import * as schema from './db/schema'
import { and, desc, eq, gte, inArray, isNull, like, lte, sql } from 'drizzle-orm'
import { escapeLikePattern } from './lib/sql-utils'
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
import { createIconLoader } from './service/shared/icon-loader'
import { createCache } from './service/shared/cache'
import { createBadgeService } from './service/domain/badge/badge'
import { createKmaApiService } from './service/domain/weather/kma-api'
import { createLocationService } from './service/domain/weather/location'
import { createWeatherApiKeyService } from './service/domain/weather/weather-api-key'
import { convertTailwindToCSS, mergeStyles } from './lib/tailwind-converter'
import { createHnFetcherService } from './service/domain/hn/hn-fetcher'
import { createContentParser } from './service/domain/hn/hn-content-parser'
import { createHnTranslator } from './service/domain/hn/hn-translator'
import * as cheerio from 'cheerio'
import { createHnDigestService } from './service/domain/hn/hn-digest'
import { createHnWebhookService } from './service/domain/hn/hn-webhook'
import { createMailCrypto } from './service/domain/mail/mail-crypto'
import { createMailProviderFactory } from './service/domain/mail/mail-provider-factory'
import { createMailAccountService } from './service/domain/mail/mail-account'
import { createMailSyncService } from './service/domain/mail/mail-sync'
import { createMailMessageService } from './service/domain/mail/mail-message'
import { createMailUploadService } from './service/domain/mail/mail-upload'
import { createMailOAuthConnectService } from './service/domain/mail/mail-oauth-connect'
import { createSpotifyAccountService } from './service/domain/spotify/spotify-account'
import { createSpotifyApiKeyService } from './service/domain/spotify/spotify-api-key'
import { createSpotifyOAuthConnectService } from './service/domain/spotify/spotify-oauth-connect'
import { createSpotifyDataService } from './service/domain/spotify/spotify-data'
import { createSpotifyProvider } from './service/domain/spotify/spotify-provider'
import { createRateLimiter } from './lib/rate-limit'
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFile } from 'fs/promises'
import { join } from 'path'
import locations from './masterdata/locations.json'
import { getEnv } from './lib/env'

export const compose = () => {
    const env = getEnv()
    const db = getDb()

    const auth = createAuthProvider({
        db,
        baseUrl: env.BASE_URL ?? 'http://localhost:9999',
        githubClientId: env.GITHUB_CLIENT_ID ?? '',
        githubClientSecret: env.GITHUB_CLIENT_SECRET ?? '',
        googleClientId: env.GOOGLE_CLIENT_ID ?? '',
        googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        secret: env.BETTER_AUTH_SECRET,
        trustedOrigins: env.TRUSTED_ORIGINS?.split(',') ?? [],
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

                if (params.keyword) conditions.push(like(posts.title, `%${escapeLikePattern(params.keyword)}%`))
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
                return db.transaction(async (tx) => {
                    const [post] = await tx
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
                        await tx.insert(postTags).values(data.tagIds.map((tagId) => ({ postId: post.postId, tagId })))
                    }
                    return post
                })
            },

            updatePost: async (postId, data) => {
                const { posts, postTags } = schema
                return db.transaction(async (tx) => {
                    const updateData: Record<string, unknown> = { updatedAt: new Date() }
                    if (data.title !== undefined) updateData.title = data.title
                    if (data.description !== undefined) updateData.description = data.description
                    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
                    if (data.isPublished !== undefined) updateData.isPublished = data.isPublished
                    if (data.isHide !== undefined) updateData.isHide = data.isHide
                    if (data.isNotice !== undefined) updateData.isNotice = data.isNotice
                    if (data.isComment !== undefined) updateData.isComment = data.isComment

                    await tx.update(posts).set(updateData).where(eq(posts.postId, postId))

                    if (data.tagIds !== undefined) {
                        await tx.delete(postTags).where(eq(postTags.postId, postId))
                        if (data.tagIds.length > 0) {
                            await tx.insert(postTags).values(data.tagIds.map((tagId) => ({ postId, tagId })))
                        }
                    }
                    return { postId }
                })
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
        endpoint: env.R2_END_POINT,
        credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
        },
    })

    const storageService = createStorageService({
        s3,
        bucket: env.R2_BUCKET ?? 'blog-cloud',
        cdnDomain: env.R2_CUSTOM_DOMAIN ?? env.R2_CUSTOME_DOMAIN ?? 'https://blogimg.gumyo.net',
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
            runTransaction: async <T>(fn: () => Promise<T>) => db.transaction(async () => fn()),
        },
        bucket: env.R2_BUCKET ?? 'blog-cloud',
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
            return db.select().from(schema.hnStories).where(sql`${schema.hnStories.title} LIKE ${`%${escapeLikePattern(q)}%`} ESCAPE '\\\\'`).orderBy(desc(schema.hnStories.score)).limit(limit)
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
            genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY ?? '' })
        }
        return genai
    }

    const hnAi = {
        summarize: async (prompt: string, maxTokens?: number) => {
            const ai = await getGenAI()
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-lite',
                contents: prompt,
                ...(maxTokens && { config: { maxOutputTokens: maxTokens } }),
            })
            return response.text ?? ''
        },
    }

    const contentParser = createContentParser({ cheerio })

    const translatorDb = {
        getExistingTags: async () => {
            const list = await db
                .select({ name: schema.hnTags.name })
                .from(schema.hnTags)
                .orderBy(desc(schema.hnTags.usageCount))
                .limit(50)
            return list.map((t) => t.name)
        },
        updateTagUsage: async (tagNames: string[]) => {
            for (const name of tagNames) {
                await db
                    .insert(schema.hnTags)
                    .values({ name, usageCount: 1 })
                    .onDuplicateKeyUpdate({ set: { usageCount: sql`usage_count + 1` } })
            }
        },
    }

    const hnTranslator = createHnTranslator({ ai: hnAi, db: translatorDb })

    const hnFetcher = createHnFetcherService({
        db: hnFetcherDb,
        contentParser,
        translator: hnTranslator,
    })
    const hnDigest = createHnDigestService({ ai: hnAi, db: hnDigestServiceDb })
    const hnWebhook = createHnWebhookService({ db: hnWebhookDb })

    const fontLoader = createFontLoader()

    const basePath = env.VERCEL ? '/var/task' : process.cwd()
    const wasmPath = join(basePath, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')

    const imageGenerator = createImageGenerator({
        satori: satori as never,
        initWasm: initWasm as never,
        Resvg: Resvg as never,
        loadWasm: () => readFile(wasmPath).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
    })

    const iconLoader = createIconLoader()
    const badgeCache = createCache<Buffer>({ maxSize: 200, defaultTtlMs: 24 * 60 * 60 * 1000 })
    const badgeService = createBadgeService({
        imageGenerator,
        fontLoader,
        iconLoader,
        cache: badgeCache,
        convertTailwindToCSS,
        mergeStyles,
    })

    const kmaApi = createKmaApiService({ apiKey: env.KMA_API_KEY ?? '' })
    const locationService = createLocationService({ locations })
    const weatherApiKeyService = createWeatherApiKeyService({ db })

    if (!env.MAIL_ENCRYPTION_KEY) {
        throw new Error('MAIL_ENCRYPTION_KEY is required for mail functionality')
    }
    const mailCrypto = createMailCrypto(env.MAIL_ENCRYPTION_KEY)

    const verifyBetterAuthOwnership = async (betterAuthAccountId: string, userId: string): Promise<boolean> => {
        const [acc] = await db
            .select({ userId: schema.account.userId })
            .from(schema.account)
            .where(and(eq(schema.account.id, betterAuthAccountId), eq(schema.account.userId, userId)))
            .limit(1)
        return !!acc
    }

    const mailProviderFactory = createMailProviderFactory({
        crypto: mailCrypto,
        getOAuthToken: async (betterAuthAccountId: string, userId: string) => {
            const [acc] = await db
                .select({ accessToken: schema.account.accessToken, refreshToken: schema.account.refreshToken })
                .from(schema.account)
                .where(and(eq(schema.account.id, betterAuthAccountId), eq(schema.account.userId, userId)))
                .limit(1)
            if (!acc?.accessToken) return null
            return { accessToken: acc.accessToken, refreshToken: acc.refreshToken ?? undefined }
        },
        refreshOAuthToken: async (betterAuthAccountId: string, refreshToken: string, userId: string) => {
            const res = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: env.GOOGLE_CLIENT_ID ?? '',
                    client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                }),
            })
            if (!res.ok) {
                const errorBody = await res.text().catch(() => 'unknown')
                throw new Error(`OAuth token refresh failed (${res.status}): ${errorBody}`)
            }
            const data = (await res.json()) as { access_token: string; expires_in: number }
            if (!data.access_token || typeof data.expires_in !== 'number') {
                throw new Error('Invalid OAuth token response')
            }
            await db
                .update(schema.account)
                .set({
                    accessToken: data.access_token,
                    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
                })
                .where(and(eq(schema.account.id, betterAuthAccountId), eq(schema.account.userId, userId)))
            return data.access_token
        },
    })

    const mailAccountDb = {
        list: async (userId: string) => {
            return db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, userId))
        },
        getById: async (id: number) => {
            const [account] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, id)).limit(1)
            return account ?? null
        },
        insert: async (data: typeof schema.mailAccounts.$inferInsert) => {
            const [result] = await db.insert(schema.mailAccounts).values(data).$returningId()
            return result
        },
        update: async (id: number, data: Record<string, unknown>) => {
            await db.update(schema.mailAccounts).set(data as never).where(eq(schema.mailAccounts.id, id))
        },
        remove: async (id: number) => {
            await db.delete(schema.mailAccounts).where(eq(schema.mailAccounts.id, id))
        },
        countByUser: async (userId: string) => {
            const [result] = await db
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.mailAccounts)
                .where(eq(schema.mailAccounts.userId, userId))
            return result?.count ?? 0
        },
    }

    const mailAccountService = createMailAccountService({
        db: mailAccountDb,
        crypto: mailCrypto,
        providerFactory: mailProviderFactory,
        verifyBetterAuthOwnership,
    })

    const mailOAuthConnect = createMailOAuthConnectService({
        googleClientId: env.GOOGLE_CLIENT_ID ?? '',
        googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        secret: env.BETTER_AUTH_SECRET ?? '',
        findAccountByProviderAndUser: async (providerId: string, userId: string, email: string) => {
            const [acc] = await db
                .select({ id: schema.account.id })
                .from(schema.account)
                .where(and(
                    eq(schema.account.providerId, providerId),
                    eq(schema.account.userId, userId),
                    eq(schema.account.accountId, email),
                ))
                .limit(1)
            return acc ?? null
        },
        upsertAccount: async (data) => {
            await db
                .insert(schema.account)
                .values({
                    id: data.id,
                    accountId: data.accountId,
                    providerId: data.providerId,
                    userId: data.userId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    accessTokenExpiresAt: data.accessTokenExpiresAt,
                    scope: data.scope,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as never)
                .onDuplicateKeyUpdate({
                    set: {
                        accessToken: data.accessToken,
                        refreshToken: data.refreshToken,
                        accessTokenExpiresAt: data.accessTokenExpiresAt,
                        scope: data.scope,
                        updatedAt: new Date(),
                    } as never,
                })
            return { id: data.id }
        },
        findMailAccountByEmail: async (userId: string, email: string) => {
            const [acc] = await db
                .select({ id: schema.mailAccounts.id })
                .from(schema.mailAccounts)
                .where(and(eq(schema.mailAccounts.userId, userId), eq(schema.mailAccounts.email, email)))
                .limit(1)
            return acc ?? null
        },
        createMailAccount: async (userId: string, input: { provider: string; email: string; betterAuthAccountId: string }) => {
            return mailAccountService.create(userId, input)
        },
    })

    const mailSyncDb = {
        upsertFolder: async (data: {
            accountId: number
            remoteFolderId: string
            name: string
            type: string
            parentId: number | null
            messageCount: number
            unreadCount: number
            uidValidity: number | null
        }) => {
            await db
                .insert(schema.mailFolders)
                .values({
                    accountId: data.accountId,
                    remoteFolderId: data.remoteFolderId,
                    name: data.name,
                    type: data.type,
                    parentId: data.parentId,
                    messageCount: data.messageCount,
                    unreadCount: data.unreadCount,
                    uidValidity: data.uidValidity,
                })
                .onDuplicateKeyUpdate({
                    set: {
                        name: data.name,
                        type: data.type,
                        uidValidity: data.uidValidity,
                    },
                })
            const [folder] = await db
                .select()
                .from(schema.mailFolders)
                .where(and(eq(schema.mailFolders.accountId, data.accountId), eq(schema.mailFolders.remoteFolderId, data.remoteFolderId)))
                .limit(1)
            return folder
        },
        getFoldersByAccount: async (accountId: number) => {
            return db.select().from(schema.mailFolders).where(eq(schema.mailFolders.accountId, accountId))
        },
        getFolderById: async (id: number) => {
            const [folder] = await db.select().from(schema.mailFolders).where(eq(schema.mailFolders.id, id)).limit(1)
            return folder ?? null
        },
        updateFolderCounts: async (folderId: number, messageCount: number, unreadCount: number) => {
            await db.update(schema.mailFolders).set({ messageCount, unreadCount }).where(eq(schema.mailFolders.id, folderId))
        },
        updateFolderSyncCursor: async (folderId: number, cursor: string | null) => {
            await db.update(schema.mailFolders).set({ syncCursor: cursor }).where(eq(schema.mailFolders.id, folderId))
        },

        upsertMessage: async (data: Record<string, unknown>) => {
            const [existing] = await db
                .select({ id: schema.mailMessages.id })
                .from(schema.mailMessages)
                .where(
                    and(
                        eq(schema.mailMessages.accountId, data.accountId as number),
                        eq(schema.mailMessages.remoteMessageId, data.remoteMessageId as string),
                    ),
                )
                .limit(1)
            const isNew = !existing

            const insertData = { ...data }
            await db
                .insert(schema.mailMessages)
                .values(insertData as never)
                .onDuplicateKeyUpdate({
                    set: {
                        subject: data.subject,
                        bodyHtml: data.bodyHtml,
                        bodyText: data.bodyText,
                        snippet: data.snippet,
                        isRead: data.isRead,
                        isStarred: data.isStarred,
                        isDraft: data.isDraft,
                        hasAttachments: data.hasAttachments,
                    } as never,
                })
            const [msg] = await db
                .select()
                .from(schema.mailMessages)
                .where(
                    and(
                        eq(schema.mailMessages.accountId, data.accountId as number),
                        eq(schema.mailMessages.remoteMessageId, data.remoteMessageId as string),
                    ),
                )
                .limit(1)
            return { ...msg, isNew }
        },
        deleteMessagesByRemoteIds: async (accountId: number, remoteIds: string[]) => {
            if (remoteIds.length === 0) return
            await db
                .delete(schema.mailMessages)
                .where(and(eq(schema.mailMessages.accountId, accountId), inArray(schema.mailMessages.remoteMessageId, remoteIds)))
        },

        upsertAttachment: async (data: Record<string, unknown>) => {
            const { messageId, remoteAttachmentId, ...updateFields } = data
            await db
                .insert(schema.mailAttachments)
                .values(data as never)
                .onDuplicateKeyUpdate({ set: updateFields as never })
            const [att] = await db
                .select()
                .from(schema.mailAttachments)
                .where(
                    and(
                        eq(schema.mailAttachments.messageId, messageId as number),
                        eq(schema.mailAttachments.remoteAttachmentId, remoteAttachmentId as string),
                    ),
                )
                .limit(1)
            return att
        },

        createSyncLog: async (data: { accountId: number; syncType: string; status: string; folderId: number | null; startedAt: Date }) => {
            const [result] = await db.insert(schema.mailSyncLogs).values(data as never).$returningId()
            const [log] = await db.select().from(schema.mailSyncLogs).where(eq(schema.mailSyncLogs.id, result.id)).limit(1)
            return log
        },
        updateSyncLog: async (id: number, data: Record<string, unknown>) => {
            await db.update(schema.mailSyncLogs).set(data as never).where(eq(schema.mailSyncLogs.id, id))
        },
        getLatestSyncLog: async (accountId: number) => {
            const [log] = await db
                .select()
                .from(schema.mailSyncLogs)
                .where(eq(schema.mailSyncLogs.accountId, accountId))
                .orderBy(desc(schema.mailSyncLogs.createdAt))
                .limit(1)
            return log ?? null
        },

        getActiveSession: async (accountId: number) => {
            const [session] = await db
                .select()
                .from(schema.mailSyncSessions)
                .where(and(eq(schema.mailSyncSessions.accountId, accountId), inArray(schema.mailSyncSessions.status, ['running', 'paused'])))
                .orderBy(desc(schema.mailSyncSessions.createdAt))
                .limit(1)
            return session ?? null
        },
        createSession: async (data: { accountId: number; folderId: number | null; syncType: string; status: string; totalEstimate: number | null; startedAt: Date }) => {
            const [result] = await db.insert(schema.mailSyncSessions).values(data as never).$returningId()
            const [session] = await db.select().from(schema.mailSyncSessions).where(eq(schema.mailSyncSessions.id, result.id)).limit(1)
            return session
        },
        updateSession: async (id: number, data: Record<string, unknown>) => {
            await db.update(schema.mailSyncSessions).set(data as never).where(eq(schema.mailSyncSessions.id, id))
        },

        countMessagesByFolder: async (folderId: number) => {
            const [result] = await db
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.mailMessages)
                .where(eq(schema.mailMessages.folderId, folderId))
            return result?.count ?? 0
        },
        countUnreadByFolder: async (folderId: number) => {
            const [result] = await db
                .select({ count: sql<number>`COUNT(*)` })
                .from(schema.mailMessages)
                .where(and(eq(schema.mailMessages.folderId, folderId), eq(schema.mailMessages.isRead, false)))
            return result?.count ?? 0
        },
    }

    const mailSyncService = createMailSyncService({
        db: mailSyncDb,
        accountService: mailAccountService,
    })

    const mailMessageListColumns = {
        id: schema.mailMessages.id,
        accountId: schema.mailMessages.accountId,
        folderId: schema.mailMessages.folderId,
        remoteMessageId: schema.mailMessages.remoteMessageId,
        messageIdHeader: schema.mailMessages.messageIdHeader,
        threadId: schema.mailMessages.threadId,
        inReplyTo: schema.mailMessages.inReplyTo,
        referencesHeader: schema.mailMessages.referencesHeader,
        fromAddress: schema.mailMessages.fromAddress,
        toAddresses: schema.mailMessages.toAddresses,
        ccAddresses: schema.mailMessages.ccAddresses,
        bccAddresses: schema.mailMessages.bccAddresses,
        subject: schema.mailMessages.subject,
        snippet: schema.mailMessages.snippet,
        isRead: schema.mailMessages.isRead,
        isStarred: schema.mailMessages.isStarred,
        isDraft: schema.mailMessages.isDraft,
        hasAttachments: schema.mailMessages.hasAttachments,
        sentAt: schema.mailMessages.sentAt,
        receivedAt: schema.mailMessages.receivedAt,
        uid: schema.mailMessages.uid,
        createdAt: schema.mailMessages.createdAt,
        updatedAt: schema.mailMessages.updatedAt,
    }

    const mailMessageDb = {
        list: async (params: { accountId?: number; folderId?: number; isRead?: boolean; isStarred?: boolean; userId: string; page: number; limit: number }) => {
            const offset = (params.page - 1) * params.limit

            let accountIds: number[]
            if (params.accountId) {
                const [owned] = await db.select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(and(eq(schema.mailAccounts.id, params.accountId), eq(schema.mailAccounts.userId, params.userId)))
                    .limit(1)
                if (!owned) return { data: [], total: 0 }
                accountIds = [params.accountId]
            } else {
                const userAccounts = await db.select({ id: schema.mailAccounts.id }).from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, params.userId))
                accountIds = userAccounts.map((a) => a.id)
                if (accountIds.length === 0) return { data: [], total: 0 }
            }

            const conditions = [inArray(schema.mailMessages.accountId, accountIds)]
            if (params.folderId) conditions.push(eq(schema.mailMessages.folderId, params.folderId))
            if (params.isRead !== undefined) conditions.push(eq(schema.mailMessages.isRead, params.isRead))
            if (params.isStarred !== undefined) conditions.push(eq(schema.mailMessages.isStarred, params.isStarred))

            const whereClause = and(...conditions)

            const [data, [{ count }]] = await Promise.all([
                db
                    .select(mailMessageListColumns)
                    .from(schema.mailMessages)
                    .where(whereClause)
                    .orderBy(desc(schema.mailMessages.receivedAt))
                    .limit(params.limit)
                    .offset(offset),
                db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(schema.mailMessages)
                    .where(whereClause),
            ])

            return { data, total: count }
        },
        getById: async (id: number) => {
            const [msg] = await db.select().from(schema.mailMessages).where(eq(schema.mailMessages.id, id)).limit(1)
            if (!msg) return null
            const attachments = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id))
            return { ...msg, attachments }
        },
        getThread: async (accountId: number, threadId: string) => {
            return db
                .select(mailMessageListColumns)
                .from(schema.mailMessages)
                .where(and(eq(schema.mailMessages.accountId, accountId), eq(schema.mailMessages.threadId, threadId)))
                .orderBy(schema.mailMessages.sentAt)
        },
        search: async (params: { q: string; accountId?: number; userId: string; page: number; limit: number }) => {
            const offset = (params.page - 1) * params.limit

            let accountIds: number[]
            if (params.accountId) {
                const [owned] = await db.select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(and(eq(schema.mailAccounts.id, params.accountId), eq(schema.mailAccounts.userId, params.userId)))
                    .limit(1)
                if (!owned) return { data: [], total: 0 }
                accountIds = [params.accountId]
            } else {
                const userAccounts = await db.select({ id: schema.mailAccounts.id }).from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, params.userId))
                accountIds = userAccounts.map((a) => a.id)
                if (accountIds.length === 0) return { data: [], total: 0 }
            }

            const escaped = escapeLikePattern(params.q)
            const conditions = [
                inArray(schema.mailMessages.accountId, accountIds),
                sql`(${schema.mailMessages.subject} LIKE ${`%${escaped}%`} ESCAPE '\\\\' OR ${schema.mailMessages.snippet} LIKE ${`%${escaped}%`} ESCAPE '\\\\')`,
            ]

            const whereClause = and(...conditions)

            const [data, [{ count }]] = await Promise.all([
                db
                    .select(mailMessageListColumns)
                    .from(schema.mailMessages)
                    .where(whereClause)
                    .orderBy(desc(schema.mailMessages.receivedAt))
                    .limit(params.limit)
                    .offset(offset),
                db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(schema.mailMessages)
                    .where(whereClause),
            ])

            return { data, total: count }
        },
        updateFlags: async (messageIds: number[], flags: Record<string, unknown>) => {
            await db.update(schema.mailMessages).set(flags as never).where(inArray(schema.mailMessages.id, messageIds))
        },
        moveToFolder: async (messageIds: number[], targetFolderId: number) => {
            await db.update(schema.mailMessages).set({ folderId: targetFolderId }).where(inArray(schema.mailMessages.id, messageIds))
        },
        deleteMessages: async (messageIds: number[]) => {
            await db.delete(schema.mailMessages).where(inArray(schema.mailMessages.id, messageIds))
        },
        getByIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.mailMessages).where(inArray(schema.mailMessages.id, ids))
        },
        getAttachment: async (attachmentId: number) => {
            const [att] = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.id, attachmentId)).limit(1)
            return att ?? null
        },
        updateAttachmentR2Key: async (attachmentId: number, r2Key: string) => {
            await db.update(schema.mailAttachments).set({ r2Key }).where(eq(schema.mailAttachments.id, attachmentId))
        },
        getAccountIdsByMessageIds: async (messageIds: number[], userId: string) => {
            const msgs = await db
                .select({
                    messageId: schema.mailMessages.id,
                    accountId: schema.mailMessages.accountId,
                    remoteMessageId: schema.mailMessages.remoteMessageId,
                    folderId: schema.mailMessages.folderId,
                })
                .from(schema.mailMessages)
                .innerJoin(schema.mailAccounts, eq(schema.mailMessages.accountId, schema.mailAccounts.id))
                .where(and(inArray(schema.mailMessages.id, messageIds), eq(schema.mailAccounts.userId, userId)))
            return msgs
        },
        getSenderList: async (params: { userId: string; accountId?: number; limit: number }) => {
            let accountIds: number[]
            if (params.accountId) {
                const [owned] = await db.select({ id: schema.mailAccounts.id })
                    .from(schema.mailAccounts)
                    .where(and(eq(schema.mailAccounts.id, params.accountId), eq(schema.mailAccounts.userId, params.userId)))
                    .limit(1)
                if (!owned) return []
                accountIds = [params.accountId]
            } else {
                const userAccounts = await db.select({ id: schema.mailAccounts.id }).from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, params.userId))
                accountIds = userAccounts.map((a) => a.id)
                if (accountIds.length === 0) return []
            }

            const rows = await db
                .select({ fromAddress: schema.mailMessages.fromAddress })
                .from(schema.mailMessages)
                .where(inArray(schema.mailMessages.accountId, accountIds))
                .orderBy(desc(schema.mailMessages.receivedAt))
                .limit(params.limit)

            const senderMap = new Map<string, string>()
            for (const row of rows) {
                const addr = (row.fromAddress as { address?: string; name?: string } | null)
                if (!addr?.address) continue
                if (!senderMap.has(addr.address)) {
                    senderMap.set(addr.address, addr.name ?? '')
                }
            }
            return [...senderMap.entries()].map(([address, name]) => ({ address, name }))
        },
        countMessagesByFolder: mailSyncDb.countMessagesByFolder,
        countUnreadByFolder: mailSyncDb.countUnreadByFolder,
        updateFolderCounts: mailSyncDb.updateFolderCounts,
        getFolderById: mailSyncDb.getFolderById,
    }

    const mailUploadDb = {
        insert: async (data: { userId: string; filename: string; mimeType: string; sizeBytes: number; r2Key: string; isInline: boolean }) => {
            const [result] = await db.insert(schema.mailUploads).values(data).$returningId()
            return { id: result.id }
        },
        getById: async (id: number) => {
            const [row] = await db.select().from(schema.mailUploads).where(eq(schema.mailUploads.id, id)).limit(1)
            return row ?? null
        },
        getByIds: async (ids: number[]) => {
            if (ids.length === 0) return []
            return db.select().from(schema.mailUploads).where(inArray(schema.mailUploads.id, ids))
        },
        deleteById: async (id: number) => {
            await db.delete(schema.mailUploads).where(eq(schema.mailUploads.id, id))
        },
    }

    const mailStorageAdapter = {
        upload: async (key: string, body: Buffer, contentType: string) => {
            await storageService.upload(key, body, contentType)
        },
        delete: async (key: string) => {
            await storageService.del(key)
        },
        getUrl: storageService.getUrl,
        download: async (key: string) => {
            try {
                const response = await fetch(storageService.getUrl(key))
                if (!response.ok) return null
                return Buffer.from(await response.arrayBuffer())
            } catch {
                return null
            }
        },
    }

    const mailUploadService = createMailUploadService({
        storage: mailStorageAdapter,
        db: mailUploadDb,
        generateId: () => crypto.randomUUID(),
    })

    const mailMessageService = createMailMessageService({
        db: mailMessageDb,
        accountService: mailAccountService,
        uploadService: mailUploadService,
        storageService: {
            upload: mailStorageAdapter.upload,
            getUrl: mailStorageAdapter.getUrl,
            download: mailStorageAdapter.download,
        },
    })

    const mailFolderDb = {
        getFoldersByAccount: mailSyncDb.getFoldersByAccount,
    }

    const mailRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })
    const mailCheckLimit = (key: string, path: string) => mailRateLimiter.checkLimit(`mail:${key}:${path}`)

    const spotifyAccountDb = {
        list: async (userId: string) => {
            return db.select().from(schema.spotifyAccounts).where(eq(schema.spotifyAccounts.userId, userId))
        },
        getById: async (id: number) => {
            const [account] = await db.select().from(schema.spotifyAccounts).where(eq(schema.spotifyAccounts.id, id)).limit(1)
            return account ?? null
        },
        update: async (id: number, data: Record<string, unknown>) => {
            await db.update(schema.spotifyAccounts).set(data as never).where(eq(schema.spotifyAccounts.id, id))
        },
        remove: async (id: number) => {
            await db.delete(schema.spotifyAccounts).where(eq(schema.spotifyAccounts.id, id))
        },
    }

    const spotifyAccountService = createSpotifyAccountService({ db: spotifyAccountDb })

    const spotifyApiKeyDb = {
        insert: async (data: { userId: string; spotifyAccountId: number; token: string; name: string | null }) => {
            const [result] = await db.insert(schema.spotifyApiKeys).values(data).$returningId()
            return result
        },
        findByToken: async (tokenHash: string) => {
            const [record] = await db
                .select({
                    id: schema.spotifyApiKeys.id,
                    userId: schema.spotifyApiKeys.userId,
                    spotifyAccountId: schema.spotifyApiKeys.spotifyAccountId,
                    expiresAt: schema.spotifyApiKeys.expiresAt,
                })
                .from(schema.spotifyApiKeys)
                .where(eq(schema.spotifyApiKeys.token, tokenHash))
                .limit(1)
            return record ?? null
        },
        updateLastUsedAt: async (id: number) => {
            await db.update(schema.spotifyApiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.spotifyApiKeys.id, id))
        },
        remove: async (userId: string, keyId: number) => {
            await db.delete(schema.spotifyApiKeys).where(and(eq(schema.spotifyApiKeys.id, keyId), eq(schema.spotifyApiKeys.userId, userId)))
        },
        listByUser: async (userId: string) => {
            return db
                .select({
                    id: schema.spotifyApiKeys.id,
                    spotifyAccountId: schema.spotifyApiKeys.spotifyAccountId,
                    name: schema.spotifyApiKeys.name,
                    expiresAt: schema.spotifyApiKeys.expiresAt,
                    lastUsedAt: schema.spotifyApiKeys.lastUsedAt,
                    createdAt: schema.spotifyApiKeys.createdAt,
                })
                .from(schema.spotifyApiKeys)
                .where(eq(schema.spotifyApiKeys.userId, userId))
        },
    }

    const spotifyApiKeyService = createSpotifyApiKeyService({ db: spotifyApiKeyDb })

    const spotifyOAuthConnect = createSpotifyOAuthConnectService({
        spotifyClientId: env.SPOTIFY_CLIENT_ID ?? '',
        spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET ?? '',
        secret: env.BETTER_AUTH_SECRET ?? '',
        findAccountByProviderAndUser: async (providerId: string, userId: string, accountId: string) => {
            const [acc] = await db
                .select({ id: schema.account.id })
                .from(schema.account)
                .where(and(eq(schema.account.providerId, providerId), eq(schema.account.userId, userId), eq(schema.account.accountId, accountId)))
                .limit(1)
            return acc ?? null
        },
        upsertAccount: async (data) => {
            await db
                .insert(schema.account)
                .values({
                    id: data.id,
                    accountId: data.accountId,
                    providerId: data.providerId,
                    userId: data.userId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    accessTokenExpiresAt: data.accessTokenExpiresAt,
                    scope: data.scope,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as never)
                .onDuplicateKeyUpdate({
                    set: {
                        accessToken: data.accessToken,
                        refreshToken: data.refreshToken,
                        accessTokenExpiresAt: data.accessTokenExpiresAt,
                        scope: data.scope,
                        updatedAt: new Date(),
                    } as never,
                })
            return { id: data.id }
        },
        findSpotifyAccountByUserId: async (userId: string, spotifyUserId: string) => {
            const [acc] = await db
                .select({ id: schema.spotifyAccounts.id })
                .from(schema.spotifyAccounts)
                .where(and(eq(schema.spotifyAccounts.userId, userId), eq(schema.spotifyAccounts.spotifyUserId, spotifyUserId)))
                .limit(1)
            return acc ?? null
        },
        createSpotifyAccount: async (data) => {
            const [result] = await db.insert(schema.spotifyAccounts).values(data).$returningId()
            return result
        },
        updateSpotifyAccount: async (id, data) => {
            await db.update(schema.spotifyAccounts).set(data as never).where(eq(schema.spotifyAccounts.id, id))
        },
    })

    const createSpotifyProviderForAccount = async (spotifyAccountId: number) => {
        const spotifyAccount = await spotifyAccountDb.getById(spotifyAccountId)
        if (!spotifyAccount?.betterAuthAccountId) throw new Error('Spotify account not found or not linked')

        return createSpotifyProvider({
            betterAuthAccountId: spotifyAccount.betterAuthAccountId,
            getOAuthToken: async (betterAuthAccountId: string) => {
                const [acc] = await db
                    .select({ accessToken: schema.account.accessToken, refreshToken: schema.account.refreshToken })
                    .from(schema.account)
                    .where(eq(schema.account.id, betterAuthAccountId))
                    .limit(1)
                if (!acc?.accessToken) return null
                return { accessToken: acc.accessToken, refreshToken: acc.refreshToken ?? undefined }
            },
            refreshOAuthToken: async (betterAuthAccountId: string, refreshTokenValue: string) => {
                const res = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID ?? ''}:${env.SPOTIFY_CLIENT_SECRET ?? ''}`).toString('base64')}`,
                    },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshTokenValue,
                    }),
                })
                if (!res.ok) {
                    const errorBody = await res.text().catch(() => 'unknown')
                    throw new Error(`Spotify token refresh failed (${res.status}): ${errorBody}`)
                }
                const data = (await res.json()) as { access_token: string; expires_in: number }
                await db
                    .update(schema.account)
                    .set({
                        accessToken: data.access_token,
                        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
                    })
                    .where(eq(schema.account.id, betterAuthAccountId))
                return data.access_token
            },
        })
    }

    const spotifyDataService = createSpotifyDataService({
        createProvider: createSpotifyProviderForAccount,
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
        badgeService,
        kmaApi,
        locationService,
        weatherApiKeyService,
        hnStoryDb,
        hnDigestDb,
        hnFetcher,
        hnDigest,
        hnWebhook,
        cronSecret: env.CRON_SECRET ?? '',
        mailAccountService,
        mailOAuthConnect,
        mailSyncService,
        mailMessageService,
        mailUploadService,
        mailFolderDb,
        mailCheckLimit,
        spotifyAccountService,
        spotifyApiKeyService,
        spotifyOAuthConnect,
        spotifyDataService,
        baseUrl: env.BASE_URL ?? '',
    }
}
