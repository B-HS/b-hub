import type { MailFolder, MailMessage } from '../../../db/schema'
import type { MailAccountService } from './mail-account'
import type { EmailAddress } from './mail-provider'
import { createAppError } from '../../../lib/error'
import { htmlToPlainText } from '../../../lib/mail-utils'

const LOCAL_DRAFTS_REMOTE_FOLDER_ID = '__local_drafts__'
const DRAFT_REMOTE_ID_PREFIX = 'local-draft:'
const DRAFTS_FOLDER_NAME = 'Drafts'
const SNIPPET_MAX_LENGTH = 200

type DraftInsert = {
    accountId: number
    folderId: number
    remoteMessageId: string
    fromAddress: EmailAddress | null
    toAddresses: EmailAddress[]
    ccAddresses: EmailAddress[]
    bccAddresses: EmailAddress[]
    subject: string | null
    bodyHtml: string | null
    bodyText: string | null
    snippet: string | null
    threadId: string | null
    inReplyTo: string | null
    referencesHeader: string | null
    isRead: boolean
    isStarred: boolean
    isDraft: boolean
    hasAttachments: boolean
    sentAt: Date | null
    receivedAt: Date | null
}

type DraftUpdate = Partial<
    Pick<
        MailMessage,
        'toAddresses' | 'ccAddresses' | 'bccAddresses' | 'subject' | 'bodyHtml' | 'bodyText' | 'snippet' | 'inReplyTo' | 'referencesHeader'
    >
>

type MailDraftDb = {
    findDraftsFolder: (accountId: number) => Promise<MailFolder | null>
    createDraftsFolder: (data: { accountId: number; remoteFolderId: string; name: string; type: string }) => Promise<MailFolder>
    insertDraft: (data: DraftInsert) => Promise<{ id: number }>
    getMessageById: (id: number) => Promise<MailMessage | null>
    updateDraft: (id: number, data: DraftUpdate) => Promise<void>
    deleteById: (id: number) => Promise<void>
    countMessagesByFolder: (folderId: number) => Promise<number>
    countUnreadByFolder: (folderId: number) => Promise<number>
    updateFolderCounts: (folderId: number, messageCount: number, unreadCount: number) => Promise<void>
}

type MailDraftServiceDeps = {
    db: MailDraftDb
    accountService: MailAccountService
    generateId: () => string
}

const buildSnippet = (bodyText?: string | null, bodyHtml?: string | null) => {
    const source = bodyText && bodyText.trim() ? bodyText : bodyHtml ? htmlToPlainText(bodyHtml) : ''
    const trimmed = source.trim()
    if (!trimmed) return null
    return trimmed.slice(0, SNIPPET_MAX_LENGTH)
}

export const createMailDraftService = (deps: MailDraftServiceDeps) => {
    const ensureDraftsFolder = async (accountId: number) => {
        const existing = await deps.db.findDraftsFolder(accountId)
        if (existing) return existing
        return deps.db.createDraftsFolder({
            accountId,
            remoteFolderId: LOCAL_DRAFTS_REMOTE_FOLDER_ID,
            name: DRAFTS_FOLDER_NAME,
            type: 'drafts',
        })
    }

    const refreshFolderCounts = async (folderId: number) => {
        const [messageCount, unreadCount] = await Promise.all([deps.db.countMessagesByFolder(folderId), deps.db.countUnreadByFolder(folderId)])
        await deps.db.updateFolderCounts(folderId, messageCount, unreadCount)
    }

    const assertMessageOwnership = async (userId: string, accountId: number) => {
        const accounts = await deps.accountService.list(userId)
        if (!accounts.some((a) => a.id === accountId)) throw createAppError('MAIL_MESSAGE_NOT_FOUND')
    }

    const assertDraftOwnership = async (userId: string, draftId: number) => {
        const draft = await deps.db.getMessageById(draftId)
        if (!draft || !draft.isDraft) throw createAppError('MAIL_MESSAGE_NOT_FOUND')
        await assertMessageOwnership(userId, draft.accountId)
        return draft
    }

    const resolveThreading = async (userId: string, input: { inReplyTo?: string; references?: string; replyToMessageId?: number }) => {
        let inReplyTo = input.inReplyTo ?? null
        let references = input.references ?? null
        let threadId: string | null = null

        if (input.replyToMessageId) {
            const original = await deps.db.getMessageById(input.replyToMessageId)
            if (!original) throw createAppError('MAIL_MESSAGE_NOT_FOUND')
            await assertMessageOwnership(userId, original.accountId)
            if (inReplyTo === null) inReplyTo = original.messageIdHeader ?? null
            if (references === null) references = [original.referencesHeader, original.messageIdHeader].filter(Boolean).join(' ') || null
            threadId = original.threadId ?? null
        }

        return { inReplyTo, references, threadId }
    }

    const createDraft = async (
        userId: string,
        input: {
            accountId: number
            to: EmailAddress[]
            cc: EmailAddress[]
            bcc: EmailAddress[]
            subject: string
            bodyHtml?: string
            bodyText?: string
            inReplyTo?: string
            references?: string
            replyToMessageId?: number
        },
    ) => {
        const account = await deps.accountService.getById(input.accountId, userId)
        const folder = await ensureDraftsFolder(input.accountId)
        const { inReplyTo, references, threadId } = await resolveThreading(userId, input)

        const { id } = await deps.db.insertDraft({
            accountId: input.accountId,
            folderId: folder.id,
            remoteMessageId: `${DRAFT_REMOTE_ID_PREFIX}${deps.generateId()}`,
            fromAddress: { name: account.displayName ?? '', address: account.email },
            toAddresses: input.to,
            ccAddresses: input.cc,
            bccAddresses: input.bcc,
            subject: input.subject,
            bodyHtml: input.bodyHtml ?? null,
            bodyText: input.bodyText ?? null,
            snippet: buildSnippet(input.bodyText, input.bodyHtml),
            threadId,
            inReplyTo,
            referencesHeader: references,
            isRead: true,
            isStarred: false,
            isDraft: true,
            hasAttachments: false,
            sentAt: null,
            receivedAt: new Date(),
        })

        await refreshFolderCounts(folder.id)

        const created = await deps.db.getMessageById(id)
        if (!created) throw createAppError('MAIL_MESSAGE_NOT_FOUND')
        return created
    }

    const updateDraft = async (
        userId: string,
        draftId: number,
        input: {
            to?: EmailAddress[]
            cc?: EmailAddress[]
            bcc?: EmailAddress[]
            subject?: string
            bodyHtml?: string
            bodyText?: string
            inReplyTo?: string
            references?: string
        },
    ) => {
        const draft = await assertDraftOwnership(userId, draftId)

        const updateData: DraftUpdate = {}
        if (input.to !== undefined) updateData.toAddresses = input.to
        if (input.cc !== undefined) updateData.ccAddresses = input.cc
        if (input.bcc !== undefined) updateData.bccAddresses = input.bcc
        if (input.subject !== undefined) updateData.subject = input.subject
        if (input.bodyHtml !== undefined) updateData.bodyHtml = input.bodyHtml
        if (input.bodyText !== undefined) updateData.bodyText = input.bodyText
        if (input.inReplyTo !== undefined) updateData.inReplyTo = input.inReplyTo
        if (input.references !== undefined) updateData.referencesHeader = input.references
        if (input.bodyText !== undefined || input.bodyHtml !== undefined) {
            const nextText = input.bodyText !== undefined ? input.bodyText : draft.bodyText
            const nextHtml = input.bodyHtml !== undefined ? input.bodyHtml : draft.bodyHtml
            updateData.snippet = buildSnippet(nextText, nextHtml)
        }

        if (Object.keys(updateData).length > 0) await deps.db.updateDraft(draftId, updateData)

        const updated = await deps.db.getMessageById(draftId)
        if (!updated) throw createAppError('MAIL_MESSAGE_NOT_FOUND')
        return updated
    }

    const deleteDraft = async (userId: string, draftId: number) => {
        const draft = await assertDraftOwnership(userId, draftId)
        await deps.db.deleteById(draftId)
        await refreshFolderCounts(draft.folderId)
        return { deleted: true }
    }

    return { createDraft, updateDraft, deleteDraft }
}

export type MailDraftService = ReturnType<typeof createMailDraftService>
