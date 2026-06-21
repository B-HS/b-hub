import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import { simpleParser } from 'mailparser'
import type {
    MailProvider,
    ProviderFolder,
    ProviderMessage,
    ProviderSyncResult,
    FetchMessagesOptions,
    ComposeEmailData,
    AttachmentData,
    EmailAddress,
    ProviderAttachment,
} from '../mail-provider'
import { sanitizeHeaderValue, sanitizeEmailName, deriveThreadId } from '../../../../lib/mail-utils'

type ImapProviderDeps = {
    email: string
    username?: string
    password: string
    imapHost: string
    imapPort: number
    imapTls: boolean
    smtpHost: string
    smtpPort: number
    smtpTls: boolean
}

const FOLDER_TYPE_MAP: Record<string, ProviderFolder['type']> = {
    '\\Inbox': 'inbox',
    '\\Sent': 'sent',
    '\\Drafts': 'drafts',
    '\\Trash': 'trash',
    '\\Junk': 'spam',
    '\\Archive': 'archive',
}

const parseAddress = (addr: { name?: string; address?: string } | undefined): EmailAddress | null => {
    if (!addr?.address) return null

    let name = addr.name ?? ''
    let address = addr.address

    if (address.includes('<') || address.includes('>')) {
        const match = address.match(/<?\s*([^<>\s]+@[^<>\s]+)\s*>?/)
        if (match) {
            const prefix = address.slice(0, address.indexOf(match[0])).replace(/[<>]/g, '').trim()
            if (prefix) name = name ? `${name} ${prefix}` : prefix
            address = match[1]
        }
    }

    return { name: name.trim(), address: address.trim() }
}

const parseAddressList = (addrs: ({ name?: string; address?: string } | undefined)[] | undefined): EmailAddress[] => {
    if (!addrs) return []
    return addrs.map(parseAddress).filter((a): a is EmailAddress => a !== null)
}

const parseReferencesHeader = (headers: Buffer | undefined): string | undefined => {
    if (!headers) return undefined
    const text = headers.toString('utf-8')
    const match = text.match(/^references:\s*([\s\S]*?)(?:\r?\n(?:\S|$))/im)
    if (!match) return undefined
    const value = match[1].replace(/\r?\n[ \t]+/g, ' ').trim()
    return value || undefined
}

export const createImapProvider = (deps: ImapProviderDeps): MailProvider => {
    let client: ImapFlow | null = null

    const getClient = (): ImapFlow => {
        if (!client) throw new Error('IMAP not connected')
        return client
    }

    const createClient = () =>
        new ImapFlow({
            host: deps.imapHost,
            port: deps.imapPort,
            secure: deps.imapTls,
            auth: { user: deps.username || deps.email, pass: deps.password },
            logger: false,
            tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
        })

    const parseEnvelope = (msg: Record<string, unknown>): Partial<ProviderMessage> => {
        const envelope = msg.envelope as Record<string, unknown> | undefined
        if (!envelope) return {}

        const from = (envelope.from as { name?: string; address?: string }[]) ?? []
        const to = (envelope.to as { name?: string; address?: string }[]) ?? []
        const cc = (envelope.cc as { name?: string; address?: string }[]) ?? []
        const bcc = (envelope.bcc as { name?: string; address?: string }[]) ?? []

        return {
            messageIdHeader: (envelope.messageId as string) ?? undefined,
            inReplyTo: (envelope.inReplyTo as string) ?? undefined,
            subject: (envelope.subject as string) ?? null,
            from: parseAddress(from[0]),
            to: parseAddressList(to),
            cc: parseAddressList(cc),
            bcc: parseAddressList(bcc),
            sentAt: envelope.date ? new Date(envelope.date as string) : null,
        }
    }

    const detectFolderType = (mailbox: { specialUse?: string; path: string }): ProviderFolder['type'] => {
        if (mailbox.specialUse) {
            return FOLDER_TYPE_MAP[mailbox.specialUse] ?? 'custom'
        }
        const lower = mailbox.path.toLowerCase()
        if (lower === 'inbox') return 'inbox'
        if (lower.includes('sent')) return 'sent'
        if (lower.includes('draft')) return 'drafts'
        if (lower.includes('trash') || lower.includes('deleted')) return 'trash'
        if (lower.includes('spam') || lower.includes('junk')) return 'spam'
        if (lower.includes('archive')) return 'archive'
        return 'custom'
    }

    return {
        async connect() {
            client = createClient()
            await client.connect()
        },

        async disconnect() {
            if (client) {
                await client.logout()
                client = null
            }
        },

        async testConnection() {
            const testClient = createClient()
            try {
                await testClient.connect()
                await testClient.logout()
                return { success: true }
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
            }
        },

        async fetchFolders(): Promise<ProviderFolder[]> {
            const imap = getClient()
            const mailboxes = await imap.list()

            const folders: ProviderFolder[] = []
            for (const mb of mailboxes) {
                let messageCount = 0
                let unreadCount = 0
                try {
                    const status = await imap.status(mb.path, { messages: true, unseen: true })
                    messageCount = status.messages ?? 0
                    unreadCount = status.unseen ?? 0
                } catch {}
                folders.push({
                    id: mb.path,
                    name: mb.name,
                    type: detectFolderType(mb as { specialUse?: string; path: string }),
                    parentId: mb.parentPath || undefined,
                    messageCount,
                    unreadCount,
                })
            }
            return folders
        },

        async fetchMessages(options: FetchMessagesOptions): Promise<ProviderSyncResult> {
            const imap = getClient()
            const { folderId, cursor, batchSize = 100, direction = 'forward' } = options

            const lock = await imap.getMailboxLock(folderId)
            try {
                const status = await imap.status(folderId, { messages: true, uidNext: true, uidValidity: true, unseen: true })
                const totalEstimate = status.messages ?? 0

                if (totalEstimate === 0) {
                    return { messages: [], deletedIds: [], newSyncCursor: null, totalEstimate }
                }

                const parsedCursor = cursor ? parseInt(cursor, 10) : 0
                const lastUid = Number.isNaN(parsedCursor) ? 0 : parsedCursor

                const uids: number[] = []
                if (lastUid > 0) {
                    const range = direction === 'backward' ? `1:${lastUid - 1}` : `${lastUid + 1}:*`
                    for await (const msg of imap.fetch(range, { uid: true }, { uid: true })) {
                        uids.push(msg.uid)
                    }
                } else {
                    for await (const msg of imap.fetch('1:*', { uid: true })) {
                        uids.push(msg.uid)
                    }
                }

                uids.sort((a, b) => b - a)
                const batchUids = uids.slice(0, batchSize)

                if (batchUids.length === 0) {
                    return { messages: [], deletedIds: [], newSyncCursor: cursor ?? null, totalEstimate }
                }

                const messages: ProviderMessage[] = []
                const uidRange = batchUids.join(',')

                for await (const msg of imap.fetch(
                    uidRange,
                    {
                        uid: true,
                        envelope: true,
                        flags: true,
                        bodyStructure: true,
                        source: true,
                        internalDate: true,
                        headers: ['references'],
                    },
                    { uid: true },
                )) {
                    const flags = msg.flags ?? new Set()
                    const envelope = parseEnvelope(msg as unknown as Record<string, unknown>)
                    const references = parseReferencesHeader(msg.headers)
                    const threadId =
                        deriveThreadId({ references, inReplyTo: envelope.inReplyTo, messageIdHeader: envelope.messageIdHeader }) ?? undefined

                    let bodyHtml: string | null = null
                    let bodyText: string | null = null
                    if (msg.source) {
                        const parsed = await simpleParser(msg.source)
                        bodyHtml = parsed.html || null
                        bodyText = parsed.text || null
                    }

                    const attachments: ProviderAttachment[] = []
                    if (msg.bodyStructure) {
                        const traverse = (node: Record<string, unknown>) => {
                            const disposition = node.disposition as string | undefined
                            const childNodes = node.childNodes as Record<string, unknown>[] | undefined
                            const partId = node.part as string | undefined

                            if (partId && (disposition === 'attachment' || disposition === 'inline')) {
                                attachments.push({
                                    id: partId,
                                    filename:
                                        ((node.dispositionParameters as Record<string, string>)?.filename ??
                                            (node.parameters as Record<string, string>)?.name) ||
                                        null,
                                    mimeType: (node.type as string) || null,
                                    sizeBytes: (node.size as number) ?? null,
                                    contentId: ((node as Record<string, string>).id ?? '').replace(/[<>]/g, '') || null,
                                    isInline: disposition === 'inline',
                                })
                            }

                            if (childNodes) {
                                childNodes.forEach((child) => traverse(child))
                            }
                        }
                        traverse(msg.bodyStructure as unknown as Record<string, unknown>)
                    }

                    const snippet = bodyText?.slice(0, 200) ?? bodyHtml?.replace(/<[^>]*>/g, '').slice(0, 200) ?? null

                    messages.push({
                        id: msg.uid.toString(),
                        messageIdHeader: envelope.messageIdHeader,
                        threadId,
                        inReplyTo: envelope.inReplyTo,
                        references,
                        subject: envelope.subject ?? null,
                        from: envelope.from ?? null,
                        to: envelope.to ?? [],
                        cc: envelope.cc ?? [],
                        bcc: envelope.bcc ?? [],
                        bodyHtml,
                        bodyText,
                        snippet,
                        isRead: flags.has('\\Seen'),
                        isStarred: flags.has('\\Flagged'),
                        isDraft: flags.has('\\Draft'),
                        sentAt: envelope.sentAt ?? null,
                        receivedAt: msg.internalDate ? new Date(msg.internalDate as unknown as string) : null,
                        uid: msg.uid,
                        attachments,
                    })
                }

                let newCursor: string | null
                if (batchUids.length === 0) {
                    newCursor = null
                } else if (direction === 'backward') {
                    newCursor = uids.length > batchSize ? Math.min(...batchUids).toString() : null
                } else {
                    newCursor = Math.max(...batchUids).toString()
                }

                return {
                    messages,
                    deletedIds: [],
                    newSyncCursor: newCursor,
                    totalEstimate,
                }
            } finally {
                lock.release()
            }
        },

        async fetchMessageDetail(messageId: string): Promise<ProviderMessage | null> {
            const imap = getClient()
            const uid = parseInt(messageId, 10)

            for await (const msg of imap.fetch(
                uid.toString(),
                {
                    uid: true,
                    envelope: true,
                    flags: true,
                    bodyStructure: true,
                    source: true,
                    internalDate: true,
                    headers: ['references'],
                },
                { uid: true },
            )) {
                const flags = msg.flags ?? new Set()
                const envelope = parseEnvelope(msg as unknown as Record<string, unknown>)
                const references = parseReferencesHeader(msg.headers)
                const threadId =
                    deriveThreadId({ references, inReplyTo: envelope.inReplyTo, messageIdHeader: envelope.messageIdHeader }) ?? undefined

                let bodyHtml: string | null = null
                let bodyText: string | null = null
                if (msg.source) {
                    const parsed = await simpleParser(msg.source)
                    bodyHtml = parsed.html || null
                    bodyText = parsed.text || null
                }

                return {
                    id: msg.uid.toString(),
                    messageIdHeader: envelope.messageIdHeader,
                    threadId,
                    inReplyTo: envelope.inReplyTo,
                    references,
                    subject: envelope.subject ?? null,
                    from: envelope.from ?? null,
                    to: envelope.to ?? [],
                    cc: envelope.cc ?? [],
                    bcc: envelope.bcc ?? [],
                    bodyHtml,
                    bodyText,
                    snippet: bodyText?.slice(0, 200) ?? null,
                    isRead: flags.has('\\Seen'),
                    isStarred: flags.has('\\Flagged'),
                    isDraft: flags.has('\\Draft'),
                    sentAt: envelope.sentAt ?? null,
                    receivedAt: msg.internalDate ? new Date(msg.internalDate as unknown as string) : null,
                    uid: msg.uid,
                    attachments: [],
                }
            }

            return null
        },

        async markRead(messageIds: string[], folderId?: string) {
            const imap = getClient()
            if (folderId) {
                const lock = await imap.getMailboxLock(folderId)
                try {
                    for (const id of messageIds) {
                        await imap.messageFlagsAdd(id, ['\\Seen'], { uid: true })
                    }
                } finally {
                    lock.release()
                }
            } else {
                for (const id of messageIds) {
                    await imap.messageFlagsAdd(id, ['\\Seen'], { uid: true })
                }
            }
        },

        async markUnread(messageIds: string[], folderId?: string) {
            const imap = getClient()
            if (folderId) {
                const lock = await imap.getMailboxLock(folderId)
                try {
                    for (const id of messageIds) {
                        await imap.messageFlagsRemove(id, ['\\Seen'], { uid: true })
                    }
                } finally {
                    lock.release()
                }
            } else {
                for (const id of messageIds) {
                    await imap.messageFlagsRemove(id, ['\\Seen'], { uid: true })
                }
            }
        },

        async markStarred(messageIds: string[], folderId?: string) {
            const imap = getClient()
            if (folderId) {
                const lock = await imap.getMailboxLock(folderId)
                try {
                    for (const id of messageIds) {
                        await imap.messageFlagsAdd(id, ['\\Flagged'], { uid: true })
                    }
                } finally {
                    lock.release()
                }
            } else {
                for (const id of messageIds) {
                    await imap.messageFlagsAdd(id, ['\\Flagged'], { uid: true })
                }
            }
        },

        async unmarkStarred(messageIds: string[], folderId?: string) {
            const imap = getClient()
            if (folderId) {
                const lock = await imap.getMailboxLock(folderId)
                try {
                    for (const id of messageIds) {
                        await imap.messageFlagsRemove(id, ['\\Flagged'], { uid: true })
                    }
                } finally {
                    lock.release()
                }
            } else {
                for (const id of messageIds) {
                    await imap.messageFlagsRemove(id, ['\\Flagged'], { uid: true })
                }
            }
        },

        async moveMessage(messageIds: string[], targetFolderId: string, _sourceFolderId?: string) {
            const imap = getClient()
            for (const id of messageIds) {
                await imap.messageMove(id, targetFolderId, { uid: true })
            }
        },

        async deleteMessage(messageIds: string[]) {
            const imap = getClient()
            for (const id of messageIds) {
                await imap.messageFlagsAdd(id, ['\\Deleted'], { uid: true })
            }
            await imap.messageDelete(messageIds.join(','), { uid: true })
        },

        async downloadAttachment(messageId: string, attachmentId: string, folderId?: string): Promise<AttachmentData> {
            const imap = getClient()
            const uid = parseInt(messageId, 10)
            const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024

            const fetchPart = async (): Promise<AttachmentData> => {
                const result = await imap.download(uid.toString(), attachmentId, { uid: true })
                if (!result?.content) throw new Error(`Attachment part not found: uid=${uid}, part=${attachmentId}`)
                const { content, meta } = result
                const chunks: Buffer[] = []
                let totalSize = 0
                for await (const chunk of content) {
                    totalSize += chunk.length
                    if (totalSize > MAX_ATTACHMENT_SIZE) throw new Error('Attachment exceeds maximum size (25MB)')
                    chunks.push(Buffer.from(chunk))
                }
                return {
                    content: Buffer.concat(chunks),
                    filename: meta.filename ?? 'attachment',
                    mimeType: meta.contentType ?? 'application/octet-stream',
                }
            }

            if (!folderId) return fetchPart()
            const lock = await imap.getMailboxLock(folderId)
            try {
                return await fetchPart()
            } finally {
                lock.release()
            }
        },

        async sendMessage(data: ComposeEmailData): Promise<{ messageId: string }> {
            const transporter = nodemailer.createTransport({
                host: deps.smtpHost,
                port: deps.smtpPort,
                secure: deps.smtpTls && deps.smtpPort === 465,
                auth: { user: deps.username || deps.email, pass: deps.password },
                ...(deps.smtpTls && deps.smtpPort !== 465 && { requireTLS: true }),
                tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
            })

            const formatAddr = (a: EmailAddress) => (a.name ? `"${sanitizeEmailName(a.name)}" <${a.address}>` : a.address)

            const info = await transporter.sendMail({
                from: deps.email,
                to: data.to.map(formatAddr).join(', '),
                cc: data.cc?.map(formatAddr).join(', '),
                bcc: data.bcc?.map(formatAddr).join(', '),
                subject: sanitizeHeaderValue(data.subject),
                html: data.bodyHtml,
                text: data.bodyText,
                inReplyTo: data.inReplyTo ? sanitizeHeaderValue(data.inReplyTo) : undefined,
                references: data.references ? sanitizeHeaderValue(data.references) : undefined,
                attachments: data.attachments?.map((att) => ({
                    filename: att.filename,
                    content: att.content,
                    contentType: att.mimeType,
                })),
            })

            return { messageId: info.messageId }
        },
    }
}
