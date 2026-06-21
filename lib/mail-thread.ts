import { extractMessageIdTokens } from './mail-utils'

type ThreadInput = {
    id: number
    messageIdHeader: string | null
    inReplyTo: string | null
    referencesHeader: string | null
    receivedAt: Date | null
    sentAt: Date | null
}

const messageTime = (m: { receivedAt: Date | null; sentAt: Date | null }): number => {
    const date = m.receivedAt ?? m.sentAt
    return date ? date.getTime() : 0
}

export const computeThreadIds = (messages: ThreadInput[]): Map<number, string> => {
    const parent = new Map<string, string>()

    const ensure = (token: string) => {
        if (!parent.has(token)) parent.set(token, token)
    }

    const find = (token: string): string => {
        let root = token
        while (parent.get(root) !== root) root = parent.get(root)!
        let cursor = token
        while (parent.get(cursor) !== root) {
            const next = parent.get(cursor)!
            parent.set(cursor, root)
            cursor = next
        }
        return root
    }

    const union = (a: string, b: string) => {
        ensure(a)
        ensure(b)
        const rootA = find(a)
        const rootB = find(b)
        if (rootA !== rootB) parent.set(rootA, rootB)
    }

    const tokensByMessage = new Map<number, string[]>()
    for (const message of messages) {
        const own = message.messageIdHeader ? extractMessageIdTokens(message.messageIdHeader) : []
        const refs = [
            ...(message.referencesHeader ? extractMessageIdTokens(message.referencesHeader) : []),
            ...(message.inReplyTo ? extractMessageIdTokens(message.inReplyTo) : []),
        ]
        const allTokens = [...own, ...refs]
        for (const token of allTokens) ensure(token)
        for (let i = 1; i < allTokens.length; i++) union(allTokens[0], allTokens[i])
        tokensByMessage.set(message.id, allTokens)
    }

    const groupMembers = new Map<string, ThreadInput[]>()
    const rootByMessage = new Map<number, string>()
    for (const message of messages) {
        const tokens = tokensByMessage.get(message.id)!
        if (tokens.length === 0) continue
        const root = find(tokens[0])
        rootByMessage.set(message.id, root)
        const members = groupMembers.get(root) ?? []
        members.push(message)
        groupMembers.set(root, members)
    }

    const threadIdByRoot = new Map<string, string>()
    for (const [root, members] of groupMembers) {
        const oldestFirst = [...members].sort((a, b) => messageTime(a) - messageTime(b))
        let threadId: string | null = null
        for (const member of oldestFirst) {
            if (!member.messageIdHeader) continue
            const tokens = extractMessageIdTokens(member.messageIdHeader)
            if (tokens.length > 0) {
                threadId = tokens[0]
                break
            }
        }
        threadIdByRoot.set(root, threadId ?? root)
    }

    const result = new Map<number, string>()
    for (const message of messages) {
        const root = rootByMessage.get(message.id)
        if (root) {
            result.set(message.id, threadIdByRoot.get(root)!)
            continue
        }
        if (message.messageIdHeader) {
            const tokens = extractMessageIdTokens(message.messageIdHeader)
            if (tokens.length > 0) result.set(message.id, tokens[0])
        }
    }
    return result
}
