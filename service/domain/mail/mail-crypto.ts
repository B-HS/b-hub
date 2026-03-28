import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const V2_PREFIX = 'v2:'
const SALT_LEN = 16
const IV_LEN = 12
const AUTH_TAG_LEN = 16
const KEY_LEN = 32

export const createMailCrypto = (encryptionKey: string) => {
    const v1Key = Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32), 'utf-8')

    const deriveKey = (salt: Buffer): Buffer => scryptSync(encryptionKey, salt, KEY_LEN, { N: 16384, r: 8, p: 1 }) as Buffer

    const encrypt = (plaintext: string): string => {
        const salt = randomBytes(SALT_LEN)
        const key = deriveKey(salt)
        const iv = randomBytes(IV_LEN)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
        const authTag = cipher.getAuthTag()
        const payload = Buffer.concat([salt, iv, authTag, encrypted])
        return V2_PREFIX + payload.toString('base64')
    }

    const decrypt = (ciphertext: string): string => {
        if (ciphertext.startsWith(V2_PREFIX)) {
            const buf = Buffer.from(ciphertext.slice(V2_PREFIX.length), 'base64')
            const salt = buf.subarray(0, SALT_LEN)
            const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN)
            const authTag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN)
            const encrypted = buf.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN)
            const key = deriveKey(salt)
            const decipher = createDecipheriv('aes-256-gcm', key, iv)
            decipher.setAuthTag(authTag)
            return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
        }

        const buf = Buffer.from(ciphertext, 'base64')
        const iv = buf.subarray(0, 12)
        const authTag = buf.subarray(12, 28)
        const encrypted = buf.subarray(28)
        const decipher = createDecipheriv('aes-256-gcm', v1Key, iv)
        decipher.setAuthTag(authTag)
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
    }

    return { encrypt, decrypt }
}

export type MailCrypto = ReturnType<typeof createMailCrypto>
