import type { MailAccount, NewMailAccount } from '../../../db/schema'
import type { MailCrypto } from './mail-crypto'
import type { MailProviderFactory } from './mail-provider-factory'
import type { MailProvider } from './mail-provider'
import { createAppError } from '../../../lib/error'

const MAX_ACCOUNTS_PER_USER = 10

type MailAccountDb = {
    list: (userId: string) => Promise<MailAccount[]>
    getById: (id: number) => Promise<MailAccount | null>
    insert: (data: NewMailAccount) => Promise<{ id: number }>
    update: (
        id: number,
        data: Partial<Pick<MailAccount, 'displayName' | 'signature' | 'isActive' | 'lastSyncAt' | 'lastSyncStatus' | 'syncCursor'>>,
    ) => Promise<void>

    remove: (id: number) => Promise<void>
    countByUser: (userId: string) => Promise<number>
}

type MailAccountServiceDeps = {
    db: MailAccountDb
    crypto: MailCrypto
    providerFactory: MailProviderFactory
    verifyBetterAuthOwnership?: (betterAuthAccountId: string, userId: string) => Promise<boolean>
}

export const createMailAccountService = (deps: MailAccountServiceDeps) => {
    const assertOwnership = async (accountId: number, userId: string): Promise<MailAccount> => {
        const account = await deps.db.getById(accountId)
        if (!account || account.userId !== userId) throw createAppError('MAIL_ACCOUNT_NOT_FOUND')
        return account
    }

    const list = async (userId: string) => {
        return deps.db.list(userId)
    }

    const getById = async (accountId: number, userId: string) => {
        return assertOwnership(accountId, userId)
    }

    const create = async (
        userId: string,
        input: {
            provider: string
            email: string
            displayName?: string
            signature?: string
            credentials?: { username?: string; password: string }
            imapHost?: string
            imapPort?: number
            imapTls?: boolean
            smtpHost?: string
            smtpPort?: number
            smtpTls?: boolean
            betterAuthAccountId?: string
        },
    ) => {
        const count = await deps.db.countByUser(userId)
        if (count >= MAX_ACCOUNTS_PER_USER) throw createAppError('MAIL_ACCOUNT_LIMIT_EXCEEDED')

        if (input.betterAuthAccountId && deps.verifyBetterAuthOwnership) {
            const isOwner = await deps.verifyBetterAuthOwnership(input.betterAuthAccountId, userId)
            if (!isOwner) throw createAppError('MAIL_OAUTH_ACCOUNT_MISMATCH')
        }

        let encryptedCredentials: string | null = null
        if (input.credentials) {
            encryptedCredentials = deps.crypto.encrypt(JSON.stringify(input.credentials))
        }

        const result = await deps.db.insert({
            userId,
            provider: input.provider,
            email: input.email,
            displayName: input.displayName ?? null,
            signature: input.signature ?? null,
            credentials: encryptedCredentials,
            imapHost: input.imapHost ?? null,
            imapPort: input.imapPort ?? null,
            imapTls: input.imapTls ?? true,
            smtpHost: input.smtpHost ?? null,
            smtpPort: input.smtpPort ?? null,
            smtpTls: input.smtpTls ?? true,
            betterAuthAccountId: input.betterAuthAccountId ?? null,
        })

        return result
    }

    const update = async (accountId: number, userId: string, input: { displayName?: string; signature?: string | null; isActive?: boolean }) => {
        await assertOwnership(accountId, userId)
        const updateData: Partial<Pick<MailAccount, 'displayName' | 'signature' | 'isActive'>> = {}
        if (input.displayName !== undefined) updateData.displayName = input.displayName
        if (input.signature !== undefined) updateData.signature = input.signature
        if (input.isActive !== undefined) updateData.isActive = input.isActive
        await deps.db.update(accountId, updateData)
    }

    const remove = async (accountId: number, userId: string) => {
        await assertOwnership(accountId, userId)
        await deps.db.remove(accountId)
    }

    const testConnection = async (accountId: number, userId: string) => {
        const account = await assertOwnership(accountId, userId)
        const provider = deps.providerFactory.create(account)
        return provider.testConnection()
    }

    const getProvider = async (accountId: number, userId: string): Promise<{ provider: MailProvider; account: MailAccount }> => {
        const account = await assertOwnership(accountId, userId)
        const provider = deps.providerFactory.create(account)
        return { provider, account }
    }

    const updateSyncStatus = async (accountId: number, status: string, syncCursor?: string) => {
        const updateData: Partial<Pick<MailAccount, 'lastSyncAt' | 'lastSyncStatus' | 'syncCursor'>> = {
            lastSyncAt: new Date(),
            lastSyncStatus: status,
        }
        if (syncCursor !== undefined) updateData.syncCursor = syncCursor
        await deps.db.update(accountId, updateData)
    }

    return { list, getById, create, update, remove, testConnection, getProvider, updateSyncStatus }
}

export type MailAccountService = ReturnType<typeof createMailAccountService>
