import type { EmailAddress, ProviderAttachment } from '../mail-provider'

const EMBEDDED_MESSAGE_MIME_TYPE = 'message/rfc822'

export const splitAddresses = (header: string): string[] => {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    let angleBracketDepth = 0
    for (const ch of header) {
        if (ch === '"') inQuotes = !inQuotes
        else if (ch === '<' && !inQuotes) angleBracketDepth++
        else if (ch === '>' && !inQuotes) angleBracketDepth = Math.max(0, angleBracketDepth - 1)
        if (ch === ',' && !inQuotes && angleBracketDepth === 0) {
            parts.push(current.trim())
            current = ''
        } else {
            current += ch
        }
    }
    if (current.trim()) parts.push(current.trim())
    return parts
}

export const parseEmailAddress = (header: string): EmailAddress[] => {
    if (!header || header.length > 5000) return []
    return splitAddresses(header).map((trimmed) => {
        const angleMatch = trimmed.match(/^(.*?)<([^>]+)>\s*$/)
        if (angleMatch) {
            const name = angleMatch[1].replace(/^["'\s]+|["'\s]+$/g, '')
            return { name, address: angleMatch[2].trim() }
        }
        const bareMatch = trimmed.match(/^(?:"(.+?)"\s+)?(\S+@\S+)$/)
        if (bareMatch) return { name: bareMatch[1]?.trim() ?? '', address: bareMatch[2].trim() }
        return { name: '', address: trimmed }
    })
}

export const getHeader = (headers: { name: string; value: string }[], name: string): string => {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export const decodeBase64Url = (data: string): string => {
    try {
        return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    } catch {
        return ''
    }
}

export const getBody = (payload: Record<string, unknown>): { html: string | null; text: string | null } => {
    let html: string | null = null
    let text: string | null = null

    const traverse = (part: Record<string, unknown>) => {
        const mimeType = part.mimeType as string
        const body = part.body as { data?: string; size?: number }
        const parts = part.parts as Record<string, unknown>[] | undefined

        if (body?.data) {
            if (mimeType === 'text/html') html = decodeBase64Url(body.data)
            else if (mimeType === 'text/plain') text = decodeBase64Url(body.data)
        }

        if (parts && mimeType !== EMBEDDED_MESSAGE_MIME_TYPE) parts.forEach(traverse)
    }

    traverse(payload)
    return { html, text }
}

export const getAttachments = (payload: Record<string, unknown>): ProviderAttachment[] => {
    const attachments: ProviderAttachment[] = []

    const traverse = (part: Record<string, unknown>) => {
        const body = part.body as { attachmentId?: string; size?: number }
        const filename = part.filename as string
        const mimeType = part.mimeType as string
        const headers = (part.headers as { name: string; value: string }[]) ?? []
        const parts = part.parts as Record<string, unknown>[] | undefined

        if (body?.attachmentId) {
            const contentId = getHeader(headers, 'Content-Id')?.replace(/[<>]/g, '') ?? null
            attachments.push({
                id: body.attachmentId,
                filename: filename || null,
                mimeType: mimeType || null,
                sizeBytes: body.size ?? null,
                contentId,
                isInline: !!contentId,
            })
        }

        if (parts) parts.forEach(traverse)
    }

    traverse(payload)
    return attachments
}
