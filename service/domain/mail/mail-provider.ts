export type EmailAddress = {
    name: string
    address: string
}

export type ProviderFolder = {
    id: string
    name: string
    type: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
    parentId?: string
    messageCount: number
    unreadCount: number
    uidValidity?: number
}

export type ProviderAttachment = {
    id: string
    filename: string | null
    mimeType: string | null
    sizeBytes: number | null
    contentId: string | null
    isInline: boolean
}

export type ProviderMessage = {
    id: string
    threadId?: string
    messageIdHeader?: string
    inReplyTo?: string
    references?: string
    from: EmailAddress | null
    to: EmailAddress[]
    cc: EmailAddress[]
    bcc: EmailAddress[]
    subject: string | null
    bodyHtml: string | null
    bodyText: string | null
    snippet: string | null
    isRead: boolean
    isStarred: boolean
    isDraft: boolean
    sentAt: Date | null
    receivedAt: Date | null
    uid?: number
    attachments: ProviderAttachment[]
}

export type FetchFoldersOptions = {
    includeCounts?: boolean
}

export type FetchMessagesOptions = {
    folderId: string
    cursor?: string
    batchSize?: number
    uidValidity?: number
    direction?: 'forward' | 'backward'
}

export type ProviderSyncResult = {
    messages: ProviderMessage[]
    deletedIds: string[]
    newSyncCursor: string | null
    totalEstimate?: number
}

export type ComposeAttachment = {
    content: Buffer
    filename: string
    mimeType: string
}

export type ComposeEmailData = {
    to: EmailAddress[]
    cc?: EmailAddress[]
    bcc?: EmailAddress[]
    subject: string
    bodyHtml?: string
    bodyText?: string
    inReplyTo?: string
    references?: string
    attachmentIds?: number[]
    attachments?: ComposeAttachment[]
}

export type MoveMessageResult = {
    uidMap?: Record<string, string>
}

export type AttachmentData = {
    content: Buffer
    filename: string
    mimeType: string
}

export type MailProvider = {
    connect(): Promise<void>
    disconnect(): Promise<void>
    testConnection(): Promise<{ success: boolean; error?: string }>

    fetchFolders(options?: FetchFoldersOptions): Promise<ProviderFolder[]>

    fetchMessages(options: FetchMessagesOptions): Promise<ProviderSyncResult>
    fetchMessageDetail(messageId: string): Promise<ProviderMessage | null>

    markRead(messageIds: string[], folderId?: string): Promise<void>
    markUnread(messageIds: string[], folderId?: string): Promise<void>
    markStarred(messageIds: string[], folderId?: string): Promise<void>
    unmarkStarred(messageIds: string[], folderId?: string): Promise<void>

    moveMessage(messageIds: string[], targetFolderId: string, sourceFolderId?: string): Promise<MoveMessageResult | void>
    deleteMessage(messageIds: string[], folderId?: string): Promise<void>

    downloadAttachment(messageId: string, attachmentId: string, folderId?: string): Promise<AttachmentData>

    sendMessage(data: ComposeEmailData): Promise<{ messageId: string }>
}
