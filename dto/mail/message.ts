import { z } from 'zod'

const emailAddressSchema = z.object({
    name: z.string(),
    address: z.email(),
})

export const mailMessageListQuerySchema = z.object({
    accountId: z.coerce.number().int().positive().optional(),
    folderId: z.coerce.number().int().positive().optional(),
    isRead: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    isStarred: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const mailMessageSearchQuerySchema = z.object({
    q: z.string().min(1).max(500).optional(),
    accountId: z.coerce.number().int().positive().optional(),
    folderId: z.coerce.number().int().positive().optional(),
    fromAddress: z.string().min(1).max(255).optional(),
    toAddress: z.string().min(1).max(255).optional(),
    hasAttachment: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    isRead: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    isStarred: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    excludeJunk: z
        .enum(['true', 'false'])
        .default('true')
        .transform((v) => v === 'true'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const mailThreadQuerySchema = z.object({
    accountId: z.coerce.number().int().positive(),
    threadId: z.string().min(1),
})

export const mailSenderListQuerySchema = z.object({
    accountId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(10000).default(10000),
})

export const mailMessageIdsSchema = z.object({
    messageIds: z.array(z.number().int().positive()).min(1).max(100),
})

export const mailMoveSchema = z.object({
    messageIds: z.array(z.number().int().positive()).min(1).max(100),
    targetFolderId: z.number().int().positive(),
})

export const mailMarkAllReadSchema = z
    .object({
        accountId: z.number().int().positive().optional(),
        folderId: z.number().int().positive().optional(),
    })
    .refine((d) => d.accountId !== undefined || d.folderId !== undefined, {
        error: 'accountId 또는 folderId 중 하나는 필수입니다',
    })

export const mailComposeSchema = z.object({
    accountId: z.number().int().positive(),
    to: z.array(emailAddressSchema).min(1),
    cc: z.array(emailAddressSchema).optional(),
    bcc: z.array(emailAddressSchema).optional(),
    subject: z
        .string()
        .max(1000)
        .refine((v) => !/[\r\n]/.test(v), { error: 'Subject must not contain CRLF characters' }),
    bodyHtml: z.string().max(1_000_000).optional(),
    bodyText: z.string().max(1_000_000).optional(),
    attachmentIds: z.array(z.number().int().positive()).optional(),
})

export const mailReplySchema = z.object({
    bodyHtml: z.string().max(1_000_000).optional(),
    bodyText: z.string().max(1_000_000).optional(),
    to: z.array(emailAddressSchema).optional(),
    cc: z.array(emailAddressSchema).optional(),
    bcc: z.array(emailAddressSchema).optional(),
    attachmentIds: z.array(z.number().int().positive()).optional(),
})

export const mailForwardSchema = z.object({
    to: z.array(emailAddressSchema).min(1),
    cc: z.array(emailAddressSchema).optional(),
    bcc: z.array(emailAddressSchema).optional(),
    bodyHtml: z.string().max(1_000_000).optional(),
    attachmentIds: z.array(z.number().int().positive()).optional(),
})

export const mailMessageParamSchema = z.object({
    messageId: z.coerce.number().int().positive(),
})

export const mailMessageResponseSchema = z.object({
    id: z.number(),
    accountId: z.number(),
    folderId: z.number(),
    subject: z.string().nullable(),
    snippet: z.string().nullable(),
    fromAddress: emailAddressSchema.nullable(),
    toAddresses: z.array(emailAddressSchema),
    isRead: z.boolean(),
    isStarred: z.boolean(),
    isDraft: z.boolean(),
    hasAttachments: z.boolean(),
    sentAt: z.string().nullable(),
    receivedAt: z.string().nullable(),
})

export const mailMessageDetailResponseSchema = mailMessageResponseSchema.extend({
    bodyHtml: z.string().nullable(),
    bodyText: z.string().nullable(),
    ccAddresses: z.array(emailAddressSchema),
    bccAddresses: z.array(emailAddressSchema),
    threadId: z.string().nullable(),
    messageIdHeader: z.string().nullable(),
    inReplyTo: z.string().nullable(),
    attachments: z.array(
        z.object({
            id: z.number(),
            filename: z.string().nullable(),
            mimeType: z.string().nullable(),
            sizeBytes: z.number().nullable(),
            isInline: z.boolean(),
        }),
    ),
})
