import { createAppError } from './error'

const ALERT_BUDGET_PER_WINDOW = 20
const ALERT_WINDOW_MS = 60_000
const DISCORD_TIMEOUT_MS = 3000
const DISCORD_CONTENT_MAX_LENGTH = 1900

type DiscordAlertPayload = {
    service: string
    errorCode: string
    severity: number
    errorDescription?: string | null
    deviceId?: string | null
}

let windowStartedAt = 0
let sentInWindow = 0

const consumeBudget = (now: number) => {
    if (now - windowStartedAt >= ALERT_WINDOW_MS) {
        windowStartedAt = now
        sentInWindow = 0
    }
    if (sentInWindow >= ALERT_BUDGET_PER_WINDOW) return false
    sentInWindow += 1
    return true
}

export const resetDiscordAlertBudget = () => {
    windowStartedAt = 0
    sentInWindow = 0
}

export const sendDiscordAlert = async (webhookUrl: string, e: DiscordAlertPayload) => {
    if (!consumeBudget(Date.now())) return false

    const head = `🚨 **${e.service}** \`${e.errorCode}\` (severity ${e.severity})`
    const device = e.deviceId ? ` · device \`${e.deviceId}\`` : ''
    const desc = e.errorDescription ? `\n${e.errorDescription}` : ''
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content: `${head}${device}${desc}`.slice(0, DISCORD_CONTENT_MAX_LENGTH),
            allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    })

    if (!res.ok) throw createAppError('EXTERNAL_API_ERROR', { status: res.status })
    return true
}
