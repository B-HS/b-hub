import type { MessageCreateInput } from '../../../dto/blog/message'

type MessageImage = {
    id: string
    url: string
    mimeType: string
    width: number | null
    height: number | null
}

type MessageUser = {
    id: string
    name: string
    image: string | null
}

type MessageWithImages = {
    id: string
    userId: string
    body: string
    replyToId: string | null
    retweetOfId: string | null
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
    images: MessageImage[]
    user: MessageUser
}

type UserProfile = {
    id: string
    name: string
    email: string
    image: string | null
    followersCount: number
    followingCount: number
}

type MessageServiceDb = {
    getUserProfile: (userId: string) => Promise<UserProfile | null>
    getMessagesByUserId: (params: { userId: string; page: number; size: number }) => Promise<{
        content: MessageWithImages[]
        totalElements: number
        totalPages: number
        prev: number | null
        next: number | null
    }>
    insertMessage: (data: {
        userId: string
        body: string
        imageIds: string[]
        replyToId: string | null
        retweetOfId: string | null
    }) => Promise<{ id: string }>
    deleteMessage: (messageId: string) => Promise<{ id: string }>
    getMessageById: (messageId: string) => Promise<MessageWithImages | null>
}

type MessageServiceDeps = {
    db: MessageServiceDb
}

export const createMessageService = (deps: MessageServiceDeps) => ({
    getUserProfile: async (userId: string) => {
        return deps.db.getUserProfile(userId)
    },

    list: async (userId: string, page: number, size: number) => {
        return deps.db.getMessagesByUserId({ userId, page, size })
    },

    create: async (userId: string, input: MessageCreateInput) => {
        return deps.db.insertMessage({
            userId,
            body: input.body,
            imageIds: input.imageIds,
            replyToId: input.replyToId,
            retweetOfId: input.retweetOfId,
        })
    },

    delete: async (messageId: string, userId: string) => {
        const existing = await deps.db.getMessageById(messageId)
        if (!existing) return { success: false as const, reason: 'not_found' as const }
        if (existing.userId !== userId) return { success: false as const, reason: 'not_owner' as const }
        await deps.db.deleteMessage(messageId)
        return { success: true as const, id: messageId }
    },
})

export type MessageService = ReturnType<typeof createMessageService>
