type DiscordAlertPayload = {
    service: string
    errorCode: string
    severity: number
    errorDescription?: string | null
    deviceId?: string | null
}

export const sendDiscordAlert = async (webhookUrl: string, e: DiscordAlertPayload) => {
    const head = `🚨 **${e.service}** \`${e.errorCode}\` (severity ${e.severity})`
    const device = e.deviceId ? ` · device \`${e.deviceId}\`` : ''
    const desc = e.errorDescription ? `\n${e.errorDescription}` : ''
    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `${head}${device}${desc}`.slice(0, 1900) }),
    })
}
