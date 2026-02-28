import { createHash } from 'crypto'

export const generateToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
