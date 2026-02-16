type NotificationDeps = {
    fetchFn?: typeof fetch
}

type DiscordEmbed = {
    title?: string
    description?: string
    color?: number
    fields?: Array<{ name: string; value: string; inline?: boolean }>
    footer?: { text: string }
    timestamp?: string
}

type DiscordPayload = {
    content?: string
    embeds?: DiscordEmbed[]
}

type WebhookResult = {
    success: boolean
    statusCode?: number
    error?: string
}

export const createNotificationService = (deps: NotificationDeps = {}) => {
    const fetchFn = deps.fetchFn ?? fetch

    const sendDiscord = async (webhookUrl: string, payload: DiscordPayload): Promise<WebhookResult> => {
        try {
            const response = await fetchFn(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            return {
                success: response.ok,
                statusCode: response.status,
                error: response.ok ? undefined : `HTTP ${response.status}`,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    const sendWebhook = async (url: string, payload: Record<string, unknown>, headers?: Record<string, string>): Promise<WebhookResult> => {
        try {
            const response = await fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify(payload),
            })

            return {
                success: response.ok,
                statusCode: response.status,
                error: response.ok ? undefined : `HTTP ${response.status}`,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    return { sendDiscord, sendWebhook }
}

export type NotificationService = ReturnType<typeof createNotificationService>
