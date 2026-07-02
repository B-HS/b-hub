import { createCredentialCrypto } from '../../../lib/credential-crypto'

export const createMailCrypto = (encryptionKey: string) => createCredentialCrypto(encryptionKey)

export type MailCrypto = ReturnType<typeof createMailCrypto>
