import { z } from 'zod'
import { isBlockedHost } from '../../lib/mail-utils'

const safeHost = z
    .string()
    .max(255)
    .refine((v) => !isBlockedHost(v), { error: '내부 네트워크 주소는 사용할 수 없습니다' })

export const mailAccountCreateSchema = z.object({
    provider: z.enum(['gmail', 'naver', 'daum', 'imap']),
    email: z.email(),
    displayName: z.string().max(100).optional(),
    signature: z.string().max(10000).optional(),
    credentials: z
        .object({
            username: z.string().min(1).optional(),
            password: z.string().min(1).max(256),
        })
        .optional(),
    imapHost: safeHost.optional(),
    imapPort: z.number().int().min(1).max(65535).optional(),
    imapTls: z.boolean().optional(),
    smtpHost: safeHost.optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpTls: z.boolean().optional(),
    betterAuthAccountId: z.string().optional(),
})

export const mailAccountUpdateSchema = z.object({
    displayName: z.string().max(100).optional(),
    signature: z.string().max(10000).nullable().optional(),
    isActive: z.boolean().optional(),
})

export const mailAccountResponseSchema = z.object({
    id: z.number(),
    provider: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    signature: z.string().nullable(),
    isActive: z.boolean(),
    lastSyncAt: z.string().nullable(),
    lastSyncStatus: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export const mailAccountParamSchema = z.object({
    accountId: z.coerce.number().int().positive(),
})

export type MailAccountCreate = z.infer<typeof mailAccountCreateSchema>
export type MailAccountUpdate = z.infer<typeof mailAccountUpdateSchema>
