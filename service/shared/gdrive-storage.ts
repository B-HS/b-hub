import { createAppError } from '../../lib/error'

type ServiceAccountKey = {
    client_email: string
    private_key: string
    token_uri: string
}

type GdriveStorageDeps = {
    serviceAccountKey: ServiceAccountKey
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive'

const base64url = (data: Uint8Array | string): string => {
    const str = typeof data === 'string' ? btoa(data) : btoa(String.fromCharCode(...data))
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
    const pemBody = pem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '').replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '').replace(/\s/g, '')
    const binary = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
    return crypto.subtle.importKey('pkcs8', binary, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

const createJwt = async (email: string, privateKey: string): Promise<string> => {
    const now = Math.floor(Date.now() / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = base64url(JSON.stringify({ iss: email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))

    const key = await importPrivateKey(privateKey)
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`))

    return `${header}.${payload}.${base64url(new Uint8Array(signature))}`
}

export const createGdriveStorageService = (deps: GdriveStorageDeps) => {
    let accessToken: string | null = null
    let tokenExpiresAt = 0

    const getAccessToken = async (): Promise<string> => {
        if (accessToken && Date.now() < tokenExpiresAt) return accessToken

        const jwt = await createJwt(deps.serviceAccountKey.client_email, deps.serviceAccountKey.private_key)

        const res = await fetch(deps.serviceAccountKey.token_uri, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
        })

        if (!res.ok) {
            throw createAppError('DRIVE_L3_DOWNLOAD_FAILED')
        }

        const data = (await res.json()) as { access_token: string; expires_in: number }
        accessToken = data.access_token
        tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
        return accessToken
    }

    return {
        download: async (gdriveFileId: string): Promise<ReadableStream> => {
            const token = await getAccessToken()
            const res = await fetch(`${DRIVE_API}/files/${gdriveFileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!res.ok || !res.body) {
                throw createAppError('DRIVE_L3_DOWNLOAD_FAILED')
            }

            return res.body
        },

        del: async (gdriveFileId: string): Promise<void> => {
            const token = await getAccessToken()
            const res = await fetch(`${DRIVE_API}/files/${gdriveFileId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!res.ok && res.status !== 404) {
                throw createAppError('STORAGE_DELETE_FAILED')
            }
        },
    }
}

export type GdriveStorageService = ReturnType<typeof createGdriveStorageService>
