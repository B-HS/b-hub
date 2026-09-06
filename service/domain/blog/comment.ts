import type { CommentCreateInput, CommentUpdateInput } from '../../../dto/blog/comment'

type CommentWithUser = {
    commentId: number
    postId: number
    userId: string
    userName: string
    userImage: string | null
    comment: string
    updatedAt: Date
    createdAt: Date
    isHide: boolean
}

type CommentServiceDb = {
    getPostCommentFlag: (postId: number) => Promise<{ isComment: boolean } | null>
    getCommentsByPostId: (postId: number) => Promise<CommentWithUser[]>
    getCommentById: (commentId: number) => Promise<CommentWithUser | null>
    insertComment: (data: { postId: number; userId: string; comment: string; isHide: boolean }) => Promise<{ commentId: number }>
    updateComment: (commentId: number, data: { comment?: string; isHide?: boolean }) => Promise<void>
    deleteComment: (commentId: number) => Promise<void>
}

type CommentServiceDeps = {
    db: CommentServiceDb
}

export const createCommentService = (deps: CommentServiceDeps) => ({
    listByPostId: async (postId: number) => {
        return deps.db.getCommentsByPostId(postId)
    },

    create: async (userId: string, input: CommentCreateInput) => {
        const post = await deps.db.getPostCommentFlag(input.postId)
        if (!post) return { success: false as const, reason: 'post_not_found' as const }
        if (!post.isComment) return { success: false as const, reason: 'comment_disabled' as const }

        const created = await deps.db.insertComment({
            postId: input.postId,
            userId,
            comment: input.comment,
            isHide: input.isHide,
        })
        return { success: true as const, commentId: created.commentId }
    },

    update: async (commentId: number, userId: string, input: CommentUpdateInput) => {
        const existing = await deps.db.getCommentById(commentId)
        if (!existing) return { success: false as const, reason: 'not_found' as const }
        if (existing.userId !== userId) return { success: false as const, reason: 'not_owner' as const }
        await deps.db.updateComment(commentId, input)
        return { success: true as const }
    },

    delete: async (commentId: number, userId: string) => {
        const existing = await deps.db.getCommentById(commentId)
        if (!existing) return { success: false as const, reason: 'not_found' as const }
        if (existing.userId !== userId) return { success: false as const, reason: 'not_owner' as const }
        await deps.db.deleteComment(commentId)
        return { success: true as const }
    },

    adminDelete: async (commentId: number) => {
        const existing = await deps.db.getCommentById(commentId)
        if (!existing) return null
        await deps.db.deleteComment(commentId)
        return { commentId }
    },

    adminUpdateHide: async (commentId: number, isHide: boolean) => {
        const existing = await deps.db.getCommentById(commentId)
        if (!existing) return null
        await deps.db.updateComment(commentId, { isHide })
        return { commentId, isHide }
    },
})

export type CommentService = ReturnType<typeof createCommentService>
