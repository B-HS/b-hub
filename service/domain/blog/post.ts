import type { PostCreateInput, PostUpdateInput, PostListQuery } from '../../../dto/blog/post'

type PostDetail = {
    postId: number
    categoryId: number
    categoryName: string | null
    title: string
    description: string
    updatedAt: Date
    createdAt: Date
    views: number
    isPublished: boolean
    isHide: boolean
    isNotice: boolean
    isComment: boolean
    tags: { tagId: number; tag: string }[]
}

type PostServiceDb = {
    getPostList: (params: {
        offset: number
        limit: number
        keyword?: string
        categoryId?: number
        tagId?: number
        isPublished?: boolean
        isHide?: boolean
        isNotice?: boolean
    }) => Promise<{ data: PostDetail[]; total: number }>
    getPostById: (id: number) => Promise<PostDetail | null>
    insertPost: (data: {
        title: string
        description: string
        categoryId: number
        tagIds: number[]
        isPublished: boolean
    }) => Promise<{ postId: number }>
    updatePost: (
        postId: number,
        data: {
            title?: string
            description?: string
            categoryId?: number
            tagIds?: number[]
            isPublished?: boolean
            isHide?: boolean
            isNotice?: boolean
            isComment?: boolean
        },
    ) => Promise<{ postId: number }>
    deletePost: (postId: number) => Promise<{ postId: number }>
    incrementViews: (postId: number) => Promise<void>
}

type PostServiceDeps = {
    db: PostServiceDb
}

export const createPostService = (deps: PostServiceDeps) => ({
    list: async (query: PostListQuery) => {
        const offset = (query.page - 1) * query.limit
        const result = await deps.db.getPostList({
            offset,
            limit: query.limit,
            keyword: query.keyword,
            categoryId: query.categoryId,
            tagId: query.tagId,
            isPublished: query.isPublished,
            isHide: query.isHide,
            isNotice: query.isNotice,
        })
        return {
            data: result.data,
            total: result.total,
            page: query.page,
            limit: query.limit,
        }
    },

    getById: async (id: number) => {
        const post = await deps.db.getPostById(id)
        if (!post) return null
        await deps.db.incrementViews(id)
        return post
    },

    create: async (input: PostCreateInput) => {
        return deps.db.insertPost({
            title: input.title,
            description: input.description,
            categoryId: input.categoryId,
            tagIds: input.tagIds,
            isPublished: input.isPublished,
        })
    },

    update: async (postId: number, input: PostUpdateInput) => {
        const existing = await deps.db.getPostById(postId)
        if (!existing) return null
        return deps.db.updatePost(postId, input)
    },

    delete: async (postId: number) => {
        const existing = await deps.db.getPostById(postId)
        if (!existing) return null
        return deps.db.deletePost(postId)
    },
})

export type PostService = ReturnType<typeof createPostService>
