import { and, desc, eq, isNull, like, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { escapeLikePattern } from '../lib/sql-utils'
import { createPostService } from '../service/domain/blog/post'
import { createCommentService } from '../service/domain/blog/comment'
import { createMessageService } from '../service/domain/blog/message'
import { createBlogImageService } from '../service/domain/blog/blog-image'
import type { ComposeBlogArgs } from './types'

export const composeBlog = ({ db, env, storageService, imageProcessor }: ComposeBlogArgs) => {
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

                let countQuery = db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(posts)
                    .$dynamic()
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

    return {
        postService,
        commentService,
        messageService,
        blogImageService,
        categoryDb,
        tagDb,
        adminDb,
    }
}
