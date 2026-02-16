type WebhookDb = {
    getActiveWebhooks: (digestType: string) => Promise<
        {
            id: number
            provider: string
            url: string
            name: string | null
            digestTypes: string[] | null
        }[]
    >
    getWebhookById: (id: number) => Promise<{
        id: number
        provider: string
        url: string
        name: string | null
    } | null>
    registerWebhook: (data: { url: string; name?: string; provider: string; digestTypes: string[] }) => Promise<void>
    deactivateWebhook: (id: number) => Promise<void>
    deleteWebhook: (id: number) => Promise<void>
    listWebhooks: () => Promise<Record<string, unknown>[]>
    webhookExists: (url: string) => Promise<boolean>
    logWebhook: (data: {
        webhookId: number
        provider: string
        digestType: string
        status: string
        payload: Record<string, unknown>
        response: string
    }) => Promise<void>
    deleteWebhooksByUrl: (url: string) => Promise<number>
}

type DigestPayload = {
    type: 'daily' | 'weekly' | 'monthly'
    date: string
    title: string
    content: string
    stories: {
        title: string
        summary: string
        url: string | null
        score: number
        tags: string[]
    }[]
}

type HnWebhookDeps = {
    db: WebhookDb
    fetchFn?: typeof fetch
}

const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 3) + '...'
}

const buildDiscordPayload = (payload: DigestPayload) => {
    const typeEmoji = payload.type === 'daily' ? '📰' : payload.type === 'weekly' ? '📅' : '📊'
    const typeLabel = payload.type === 'daily' ? '일간' : payload.type === 'weekly' ? '주간' : '월간'

    return {
        embeds: [
            {
                title: `${typeEmoji} HN ${typeLabel} 다이제스트 - ${payload.date}`,
                description: truncateText(payload.content, 2000),
                color: 0xff6600,
                timestamp: new Date().toISOString(),
            },
            ...payload.stories.slice(0, 5).map((story, index) => ({
                title: `${index + 1}. ${truncateText(story.title, 200)}`,
                description: truncateText(story.summary, 300),
                url: story.url ?? undefined,
                color: 0x333333,
                fields: [
                    { name: '점수', value: String(story.score), inline: true },
                    {
                        name: '태그',
                        value: story.tags.join(', ') || '없음',
                        inline: true,
                    },
                ],
            })),
        ],
    }
}

export const createHnWebhookService = (deps: HnWebhookDeps) => {
    const fetchFn = deps.fetchFn ?? fetch

    const sendToWebhook = async (webhook: { id: number; provider: string; url: string }, payload: DigestPayload) => {
        try {
            const body = webhook.provider === 'discord' ? JSON.stringify(buildDiscordPayload(payload)) : JSON.stringify(payload)

            const response = await fetchFn(webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            })

            await deps.db.logWebhook({
                webhookId: webhook.id,
                provider: webhook.provider,
                digestType: payload.type,
                status: response.ok ? 'success' : 'failed',
                payload: {
                    type: payload.type,
                    date: payload.date,
                    storyCount: payload.stories.length,
                },
                response: truncateText(await response.text(), 1000),
            })

            return response.ok
        } catch (error) {
            await deps.db.logWebhook({
                webhookId: webhook.id,
                provider: webhook.provider,
                digestType: payload.type,
                status: 'failed',
                payload: { type: payload.type, date: payload.date },
                response: String(error),
            })
            return false
        }
    }

    const sendDigestWebhook = async (payload: DigestPayload) => {
        const activeWebhooks = await deps.db.getActiveWebhooks(payload.type)

        const result = {
            total: activeWebhooks.length,
            success: 0,
            failed: 0,
            details: [] as {
                webhookId: number
                name: string | null
                status: 'success' | 'failed'
            }[],
        }

        for (const webhook of activeWebhooks) {
            const success = await sendToWebhook(webhook, payload)
            if (success) result.success++
            else result.failed++
            result.details.push({
                webhookId: webhook.id,
                name: webhook.name,
                status: success ? 'success' : 'failed',
            })
        }

        return result
    }

    const createDigestPayload = (
        type: 'daily' | 'weekly' | 'monthly',
        date: string,
        content: string,
        stories: DigestPayload['stories'],
    ): DigestPayload => {
        const typeLabel = type === 'daily' ? '일간' : type === 'weekly' ? '주간' : '월간'
        return {
            type,
            date,
            title: `HN ${typeLabel} 다이제스트 - ${date}`,
            content,
            stories,
        }
    }

    const register = async (url: string, name?: string, provider = 'discord', digestTypes = ['daily', 'weekly', 'monthly']) => {
        const exists = await deps.db.webhookExists(url)
        if (exists) return { success: false, error: '이미 등록된 URL입니다' }

        await deps.db.registerWebhook({ url, name, provider, digestTypes })
        return { success: true }
    }

    const deactivate = async (id: number) => {
        await deps.db.deactivateWebhook(id)
    }

    const remove = async (id: number) => {
        await deps.db.deleteWebhook(id)
    }

    const removeByUrl = async (url: string) => {
        const count = await deps.db.deleteWebhooksByUrl(url)
        return { deleted: count }
    }

    const list = async () => {
        return deps.db.listWebhooks()
    }

    const test = async (id: number) => {
        const webhook = await deps.db.getWebhookById(id)
        if (!webhook) return { success: false, error: 'Webhook not found' }

        const testPayload: DigestPayload = {
            type: 'daily',
            date: new Date().toISOString().split('T')[0],
            title: 'HN Digest 테스트 메시지',
            content: '이것은 테스트 메시지입니다.',
            stories: [
                {
                    title: '테스트 스토리',
                    summary: '테스트',
                    url: 'https://news.ycombinator.com',
                    score: 100,
                    tags: ['Test'],
                },
            ],
        }

        const success = await sendToWebhook(webhook, testPayload)
        return { success, webhookId: id, name: webhook.name }
    }

    return {
        sendDigestWebhook,
        createDigestPayload,
        register,
        deactivate,
        remove,
        removeByUrl,
        list,
        test,
    }
}

export type HnWebhookService = ReturnType<typeof createHnWebhookService>
