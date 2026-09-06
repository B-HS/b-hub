import { z } from 'zod'

export const AI_PROVIDER = { CODEX: 'codex', ANTHROPIC: 'anthropic', OLLAMA: 'ollama' } as const
export const AI_PROVIDER_STATUS = { ACTIVE: 'active', REAUTH_REQUIRED: 'reauth_required', DISABLED: 'disabled' } as const

export const aiProviderNameSchema = z.enum(['codex', 'anthropic', 'ollama'])

const codexOauthCredentialsSchema = z.object({
    idToken: z.string().min(1).max(8192),
    accessToken: z.string().min(1).max(8192),
    refreshToken: z.string().min(1).max(8192),
    accountId: z.string().max(255).optional(),
    lastRefresh: z.string().max(64).optional(),
})

const codexTokenCredentialsSchema = z.object({
    accessToken: z.string().min(1).max(8192),
    accountId: z.string().max(255).optional(),
})

const codexCredentialsSchema = z.union([codexOauthCredentialsSchema, codexTokenCredentialsSchema])

const apiKeyCredentialsSchema = z.object({
    apiKey: z.string().min(1).max(512),
})

export const aiProviderCreateSchema = z.discriminatedUnion('provider', [
    z.object({ provider: z.literal('codex'), displayName: z.string().max(100).optional(), credentials: codexCredentialsSchema }),
    z.object({ provider: z.literal('anthropic'), displayName: z.string().max(100).optional(), credentials: apiKeyCredentialsSchema }),
    z.object({ provider: z.literal('ollama'), displayName: z.string().max(100).optional(), credentials: apiKeyCredentialsSchema }),
])

export const aiProviderUpdateSchema = z.object({
    displayName: z.string().max(100).optional(),
    status: z.enum(['active', 'disabled']).optional(),
})

export const aiProviderParamSchema = z.object({
    providerId: z.coerce.number().int().positive(),
})

export const aiProviderResponseSchema = z.object({
    id: z.number(),
    provider: z.string(),
    authType: z.string(),
    status: z.string(),
    statusDetail: z.string().nullable(),
    displayName: z.string(),
    lastUsedAt: z.string().nullable(),
    lastRefreshedAt: z.string().nullable(),
    modelsFetchedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export type AiProviderName = z.infer<typeof aiProviderNameSchema>
export type AiProviderCreate = z.infer<typeof aiProviderCreateSchema>
export type AiProviderUpdate = z.infer<typeof aiProviderUpdateSchema>
export type CodexCredentials = z.infer<typeof codexCredentialsSchema>
export type ApiKeyCredentials = z.infer<typeof apiKeyCredentialsSchema>
