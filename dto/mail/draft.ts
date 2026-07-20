import { z } from 'zod'

const emailAddressSchema = z.object({
    name: z.string(),
    address: z.email(),
})

const noCrlf = (v: string) => !/[\r\n]/.test(v)

export const mailDraftCreateSchema = z.object({
    accountId: z.number().int().positive(),
    to: z.array(emailAddressSchema).default([]),
    cc: z.array(emailAddressSchema).default([]),
    bcc: z.array(emailAddressSchema).default([]),
    subject: z.string().max(1000).refine(noCrlf, { error: 'Subject must not contain CRLF characters' }).default(''),
    bodyHtml: z.string().max(1_000_000).optional(),
    bodyText: z.string().max(1_000_000).optional(),
    inReplyTo: z.string().max(500).refine(noCrlf, { error: 'inReplyTo must not contain CRLF characters' }).optional(),
    references: z.string().max(2000).refine(noCrlf, { error: 'references must not contain CRLF characters' }).optional(),
    replyToMessageId: z.number().int().positive().optional(),
})

export const mailDraftUpdateSchema = z.object({
    to: z.array(emailAddressSchema).optional(),
    cc: z.array(emailAddressSchema).optional(),
    bcc: z.array(emailAddressSchema).optional(),
    subject: z.string().max(1000).refine(noCrlf, { error: 'Subject must not contain CRLF characters' }).optional(),
    bodyHtml: z.string().max(1_000_000).optional(),
    bodyText: z.string().max(1_000_000).optional(),
    inReplyTo: z.string().max(500).refine(noCrlf, { error: 'inReplyTo must not contain CRLF characters' }).optional(),
    references: z.string().max(2000).refine(noCrlf, { error: 'references must not contain CRLF characters' }).optional(),
})

export const mailDraftParamSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const mailDraftResponseSchema = z.object({
    id: z.number(),
    accountId: z.number(),
    folderId: z.number(),
    subject: z.string().nullable(),
    snippet: z.string().nullable(),
    fromAddress: emailAddressSchema.nullable(),
    toAddresses: z.array(emailAddressSchema),
    ccAddresses: z.array(emailAddressSchema),
    bccAddresses: z.array(emailAddressSchema),
    bodyHtml: z.string().nullable(),
    bodyText: z.string().nullable(),
    isRead: z.boolean(),
    isStarred: z.boolean(),
    isDraft: z.boolean(),
    hasAttachments: z.boolean(),
    threadId: z.string().nullable(),
    messageIdHeader: z.string().nullable(),
    inReplyTo: z.string().nullable(),
    references: z.string().nullable(),
    sentAt: z.string().nullable(),
    receivedAt: z.string().nullable(),
})

export type MailDraftCreate = z.infer<typeof mailDraftCreateSchema>
export type MailDraftUpdate = z.infer<typeof mailDraftUpdateSchema>
