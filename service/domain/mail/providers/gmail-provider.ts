import type {
    MailProvider,
    ProviderFolder,
    ProviderMessage,
    ProviderSyncResult,
    FetchMessagesOptions,
    ComposeEmailData,
    AttachmentData,
    EmailAddress,
} from '../mail-provider'
import { parseEmailAddress, getHeader, getBody, getAttachments } from './gmail-helpers'
import { sanitizeHeaderValue, sanitizeEmailName } from '../../../../lib/mail-utils'

type GmailProviderDeps = {
    email: string
    betterAuthAccountId: string
    getOAuthToken: (accountId: string) => Promise<{ accessToken: string; refreshToken?: string } | null>
    refreshOAuthToken: (betterAuthAccountId: string, refreshToken: string) => Promise<string>
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const LABEL_TYPE_MAP: Record<string, ProviderFolder['type']> = {
    INBOX: 'inbox',
    SENT: 'sent',
    DRAFT: 'drafts',
    TRASH: 'trash',
    SPAM: 'spam',
}

export const createGmailProvider = (deps: GmailProviderDeps): MailProvider => {
    let accessToken: string | null = null
    let refreshToken: string | null = null
    let refreshPromise: Promise<string> | null = null

    const getToken = async (): Promise<string> => {
        if (accessToken) return accessToken
        const tokens = await deps.getOAuthToken(deps.betterAuthAccountId)
        if (!tokens) throw new Error('OAuth token not found')
        accessToken = tokens.accessToken
        refreshToken = tokens.refreshToken ?? null
        return accessToken
    }

    const gmailFetch = async (path: string, options: RequestInit = {}, retries = 3): Promise<Response> => {
        let token = await getToken()
        let res = await fetch(`${GMAIL_API}${path}`, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, ...options.headers },
        })

        if (res.status === 401 && refreshToken) {
            if (!refreshPromise) {
                refreshPromise = deps.refreshOAuthToken(deps.betterAuthAccountId, refreshToken).then((newToken) => {
                    accessToken = newToken
                    refreshPromise = null
                    return newToken
                }).catch((err) => {
                    refreshPromise = null
                    throw err
                })
            }
            token = await refreshPromise
            res = await fetch(`${GMAIL_API}${path}`, {
                ...options,
                headers: { Authorization: `Bearer ${token}`, ...options.headers },
            })
        }

        if (res.status === 429 && retries > 0) {
            const delay = (4 - retries) * 1000
            await new Promise((r) => setTimeout(r, delay))
            return gmailFetch(path, options, retries - 1)
        }

        if (!res.ok) {
            await res.text()
            console.error(`Gmail API error ${res.status}`)
            throw new Error(`Gmail API error ${res.status}`)
        }
        return res
    }

    const parseMessage = (raw: Record<string, unknown>): ProviderMessage => {
        const payload = raw.payload as Record<string, unknown>
        const headers = (payload.headers as { name: string; value: string }[]) ?? []
        const labelIds = (raw.labelIds as string[]) ?? []
        const { html, text } = getBody(payload)
        const snippet = (raw.snippet as string) ?? null
        const fromHeader = getHeader(headers, 'From')
        const fromParsed = parseEmailAddress(fromHeader)

        return {
            id: raw.id as string,
            threadId: (raw.threadId as string) ?? undefined,
            messageIdHeader: getHeader(headers, 'Message-Id') || undefined,
            inReplyTo: getHeader(headers, 'In-Reply-To') || undefined,
            references: getHeader(headers, 'References') || undefined,
            from: fromParsed[0] ?? null,
            to: parseEmailAddress(getHeader(headers, 'To')),
            cc: parseEmailAddress(getHeader(headers, 'Cc')),
            bcc: parseEmailAddress(getHeader(headers, 'Bcc')),
            subject: getHeader(headers, 'Subject') || null,
            bodyHtml: html,
            bodyText: text,
            snippet,
            isRead: !labelIds.includes('UNREAD'),
            isStarred: labelIds.includes('STARRED'),
            isDraft: labelIds.includes('DRAFT'),
            sentAt: getHeader(headers, 'Date') ? new Date(getHeader(headers, 'Date')) : null,
            receivedAt: raw.internalDate ? new Date(parseInt(raw.internalDate as string, 10)) : null,
            attachments: getAttachments(payload),
        }
    }

    const fetchMessagesBatch = async (ids: string[], skipErrors = false): Promise<ProviderMessage[]> => {
        const messages: ProviderMessage[] = []
        for (let i = 0; i < ids.length; i += 15) {
            const batch = ids.slice(i, i + 15)
            const results = await Promise.all(
                batch.map(async (id) => {
                    try {
                        const res = await gmailFetch(`/messages/${id}?format=full`)
                        return parseMessage((await res.json()) as Record<string, unknown>)
                    } catch {
                        if (skipErrors) return null
                        throw new Error(`Failed to fetch message ${id}`)
                    }
                }),
            )
            messages.push(...results.filter((m): m is ProviderMessage => m !== null))
        }
        return messages
    }

    return {
        async connect() {
            await getToken()
        },

        async disconnect() {
            accessToken = null
            refreshToken = null
        },

        async testConnection() {
            try {
                await gmailFetch('/profile')
                return { success: true }
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
            }
        },

        async fetchFolders(): Promise<ProviderFolder[]> {
            const res = await gmailFetch('/labels')
            const data = (await res.json()) as { labels: Record<string, unknown>[] }

            const SKIP_LABELS = new Set(['IMPORTANT', 'CHAT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'STARRED', 'UNREAD'])

            const filtered = data.labels.filter((label) => !SKIP_LABELS.has(label.id as string))

            const folders = await Promise.all(
                filtered.map(async (label) => {
                    const id = label.id as string
                    const name = label.name as string
                    const type = LABEL_TYPE_MAP[id] ?? 'custom'

                    const detailRes = await gmailFetch(`/labels/${id}`)
                    const detail = (await detailRes.json()) as Record<string, unknown>

                    return {
                        id,
                        name,
                        type,
                        messageCount: (detail.messagesTotal as number) ?? 0,
                        unreadCount: (detail.messagesUnread as number) ?? 0,
                    } as ProviderFolder
                }),
            )

            return folders
        },

        async fetchMessages(options: FetchMessagesOptions): Promise<ProviderSyncResult> {
            const { folderId, cursor, batchSize = 100, direction = 'forward' } = options

            // Historical/backward sync: pageToken pagination for syncHistorical
            if (direction === 'backward') {
                const params = new URLSearchParams({ maxResults: batchSize.toString() })
                if (folderId) params.set('labelIds', folderId)
                if (cursor) params.set('pageToken', cursor)

                const listRes = await gmailFetch(`/messages?${params}`)
                const listData = (await listRes.json()) as Record<string, unknown>
                const messageRefs = (listData.messages as { id: string }[]) ?? []

                const messages = await fetchMessagesBatch(messageRefs.map((r) => r.id))

                return {
                    messages,
                    deletedIds: [],
                    newSyncCursor: (listData.nextPageToken as string) ?? null,
                    totalEstimate: (listData.resultSizeEstimate as number) ?? undefined,
                }
            }

            // Incremental sync via History API (when cursor = historyId from previous sync)
            if (cursor) {
                try {
                    const addedIds = new Set<string>()
                    const deletedIds = new Set<string>()
                    let latestHistoryId: string | null = null
                    let pageToken: string | undefined

                    // Paginate through all history pages to avoid skipping changes
                    do {
                        const params = new URLSearchParams({
                            startHistoryId: cursor,
                            maxResults: batchSize.toString(),
                        })
                        if (folderId) params.set('labelId', folderId)
                        if (pageToken) params.set('pageToken', pageToken)

                        const historyRes = await gmailFetch(`/history?${params}`)
                        const historyData = (await historyRes.json()) as Record<string, unknown>
                        const history = (historyData.history as Record<string, unknown>[]) ?? []
                        latestHistoryId = (historyData.historyId as string) ?? null
                        pageToken = historyData.nextPageToken as string | undefined

                        for (const entry of history) {
                            const msgsAdded = entry.messagesAdded as { message: { id: string } }[] | undefined
                            const msgsDeleted = entry.messagesDeleted as { message: { id: string } }[] | undefined
                            const lblsAdded = entry.labelsAdded as { message: { id: string }; labelIds: string[] }[] | undefined
                            const lblsRemoved = entry.labelsRemoved as { message: { id: string }; labelIds: string[] }[] | undefined
                            if (msgsAdded) msgsAdded.forEach((m) => addedIds.add(m.message.id))
                            if (msgsDeleted) msgsDeleted.forEach((m) => deletedIds.add(m.message.id))
                            if (lblsAdded) {
                                lblsAdded.forEach((m) => {
                                    if (!folderId || m.labelIds?.includes(folderId)) {
                                        addedIds.add(m.message.id)
                                    }
                                })
                            }
                            if (lblsRemoved) {
                                lblsRemoved.forEach((m) => {
                                    if (!folderId || m.labelIds?.includes(folderId)) {
                                        deletedIds.add(m.message.id)
                                    }
                                })
                            }
                        }
                    } while (pageToken)

                    for (const id of deletedIds) addedIds.delete(id)

                    const messages = await fetchMessagesBatch(Array.from(addedIds), true)

                    return {
                        messages,
                        deletedIds: Array.from(deletedIds),
                        newSyncCursor: latestHistoryId ?? cursor,
                    }
                } catch (error) {
                    // historyId expired (404) or invalid — fall through to full fetch
                    if (error instanceof Error && /Gmail API error (404|400)/.test(error.message)) {
                        // Fall through to full fetch below
                    } else {
                        throw error
                    }
                }
            }

            // Full fetch: first sync or expired history cursor
            const params = new URLSearchParams({ maxResults: batchSize.toString() })
            if (folderId) params.set('labelIds', folderId)

            const listRes = await gmailFetch(`/messages?${params}`)
            const listData = (await listRes.json()) as Record<string, unknown>
            const messageRefs = (listData.messages as { id: string }[]) ?? []

            const [messages, profileRes] = await Promise.all([
                fetchMessagesBatch(messageRefs.map((r) => r.id)),
                gmailFetch('/profile'),
            ])

            const profile = (await profileRes.json()) as Record<string, unknown>

            return {
                messages,
                deletedIds: [],
                newSyncCursor: (profile.historyId as string)?.toString() ?? null,
                totalEstimate: (listData.resultSizeEstimate as number) ?? undefined,
            }
        },

        async fetchMessageDetail(messageId: string): Promise<ProviderMessage | null> {
            try {
                const res = await gmailFetch(`/messages/${messageId}?format=full`)
                return parseMessage((await res.json()) as Record<string, unknown>)
            } catch {
                return null
            }
        },

        async markRead(messageIds: string[]) {
            for (const id of messageIds) {
                await gmailFetch(`/messages/${id}/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
                })
            }
        },

        async markUnread(messageIds: string[]) {
            for (const id of messageIds) {
                await gmailFetch(`/messages/${id}/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
                })
            }
        },

        async markStarred(messageIds: string[]) {
            for (const id of messageIds) {
                await gmailFetch(`/messages/${id}/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ addLabelIds: ['STARRED'] }),
                })
            }
        },

        async unmarkStarred(messageIds: string[]) {
            for (const id of messageIds) {
                await gmailFetch(`/messages/${id}/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ removeLabelIds: ['STARRED'] }),
                })
            }
        },

        async moveMessage(messageIds: string[], targetFolderId: string, sourceFolderId?: string) {
            for (const id of messageIds) {
                const body: Record<string, string[]> = { addLabelIds: [targetFolderId] }
                if (sourceFolderId) body.removeLabelIds = [sourceFolderId]
                await gmailFetch(`/messages/${id}/modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
            }
        },

        async deleteMessage(messageIds: string[]) {
            for (const id of messageIds) {
                await gmailFetch(`/messages/${id}/trash`, { method: 'POST' })
            }
        },

        async downloadAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
            const res = await gmailFetch(`/messages/${messageId}/attachments/${attachmentId}`)
            const data = (await res.json()) as { data: string }
            const content = Buffer.from(data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
            const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
            if (content.length > MAX_ATTACHMENT_SIZE) {
                throw new Error('Attachment exceeds maximum size (25MB)')
            }

            const msgRes = await gmailFetch(`/messages/${messageId}?format=metadata&metadataHeaders=Content-Type`)
            const msgData = (await msgRes.json()) as Record<string, unknown>
            const attachments = getAttachments(msgData.payload as Record<string, unknown>)
            const att = attachments.find((a) => a.id === attachmentId)

            return {
                content,
                filename: att?.filename ?? 'attachment',
                mimeType: att?.mimeType ?? 'application/octet-stream',
            }
        },

        async sendMessage(data: ComposeEmailData): Promise<{ messageId: string }> {
            const formatAddr = (a: EmailAddress) => (a.name ? `"${sanitizeEmailName(a.name)}" <${a.address}>` : a.address)
            const headers: string[] = []
            headers.push(`To: ${data.to.map(formatAddr).join(', ')}`)
            if (data.cc?.length) headers.push(`Cc: ${data.cc.map(formatAddr).join(', ')}`)
            if (data.bcc?.length) headers.push(`Bcc: ${data.bcc.map(formatAddr).join(', ')}`)
            headers.push(`Subject: ${sanitizeHeaderValue(data.subject)}`)
            if (data.inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeaderValue(data.inReplyTo)}`)
            if (data.references) headers.push(`References: ${sanitizeHeaderValue(data.references)}`)
            headers.push('MIME-Version: 1.0')

            let rawMessage: string
            if (data.attachments?.length) {
                const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`
                headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

                const parts: string[] = []
                parts.push(headers.join('\r\n'))
                parts.push('')
                parts.push(`--${boundary}`)
                parts.push('Content-Type: text/html; charset=utf-8')
                parts.push('')
                parts.push(data.bodyHtml ?? data.bodyText ?? '')

                for (const att of data.attachments) {
                    const safeMime = sanitizeHeaderValue(att.mimeType)
                    const safeName = sanitizeHeaderValue(att.filename)
                    parts.push(`--${boundary}`)
                    parts.push(`Content-Type: ${safeMime}; name="${safeName}"`)
                    parts.push('Content-Transfer-Encoding: base64')
                    parts.push(`Content-Disposition: attachment; filename="${safeName}"`)
                    parts.push('')
                    parts.push(att.content.toString('base64'))
                }

                parts.push(`--${boundary}--`)
                rawMessage = parts.join('\r\n')
            } else {
                headers.push('Content-Type: text/html; charset=utf-8')
                rawMessage = headers.join('\r\n') + '\r\n\r\n' + (data.bodyHtml ?? data.bodyText ?? '')
            }

            const raw = Buffer.from(rawMessage).toString('base64url')

            const res = await gmailFetch('/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw }),
            })
            const result = (await res.json()) as { id: string }
            return { messageId: result.id }
        },
    }
}
