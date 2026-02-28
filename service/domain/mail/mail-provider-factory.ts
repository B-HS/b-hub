import type { MailAccount } from '../../../db/schema'
import type { MailCrypto } from './mail-crypto'
import type { MailProvider } from './mail-provider'
import { createGmailProvider } from './providers/gmail-provider'
import { createImapProvider } from './providers/imap-provider'
import { createAppError } from '../../../lib/error'

type ImapPreset = {
    imapHost: string
    imapPort: number
    imapTls: boolean
    smtpHost: string
    smtpPort: number
    smtpTls: boolean
}

const IMAP_PRESETS: Record<string, ImapPreset> = {
    naver: {
        imapHost: 'imap.naver.com',
        imapPort: 993,
        imapTls: true,
        smtpHost: 'smtp.naver.com',
        smtpPort: 587,
        smtpTls: true,
    },
    daum: {
        imapHost: 'imap.daum.net',
        imapPort: 993,
        imapTls: true,
        smtpHost: 'smtp.daum.net',
        smtpPort: 465,
        smtpTls: true,
    },
}

type MailProviderFactoryDeps = {
    crypto: MailCrypto
    getOAuthToken: (accountId: string, userId: string) => Promise<{ accessToken: string; refreshToken?: string } | null>
    refreshOAuthToken: (betterAuthAccountId: string, refreshToken: string, userId: string) => Promise<string>
}

export const createMailProviderFactory = (deps: MailProviderFactoryDeps) => {
    const create = (account: MailAccount): MailProvider => {
        if (account.provider === 'gmail') {
            if (!account.betterAuthAccountId) throw createAppError('MAIL_CREDENTIALS_INVALID')
            const userId = account.userId
            return createGmailProvider({
                email: account.email,
                betterAuthAccountId: account.betterAuthAccountId,
                getOAuthToken: (accountId) => deps.getOAuthToken(accountId, userId),
                refreshOAuthToken: (accountId, refreshToken) => deps.refreshOAuthToken(accountId, refreshToken, userId),
            })
        }

        const preset = IMAP_PRESETS[account.provider]
        let credentials: { username?: string; password?: string } = {}
        if (account.credentials) {
            try {
                credentials = JSON.parse(deps.crypto.decrypt(account.credentials))
            } catch {
                throw createAppError('MAIL_CREDENTIALS_INVALID')
            }
        }
        if (!credentials.password) throw createAppError('MAIL_CREDENTIALS_INVALID')

        return createImapProvider({
            email: account.email,
            username: credentials.username,
            password: credentials.password,
            imapHost: account.imapHost ?? preset?.imapHost ?? '',
            imapPort: account.imapPort ?? preset?.imapPort ?? 993,
            imapTls: account.imapTls ?? preset?.imapTls ?? true,
            smtpHost: account.smtpHost ?? preset?.smtpHost ?? '',
            smtpPort: account.smtpPort ?? preset?.smtpPort ?? 587,
            smtpTls: account.smtpTls ?? preset?.smtpTls ?? true,
        })
    }

    return { create }
}

export type MailProviderFactory = ReturnType<typeof createMailProviderFactory>
