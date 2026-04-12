type ServiceAccountKey = {
    client_email: string
    private_key: string
    token_uri: string
}

type GdriveClientDeps = {
    serviceAccountKey: ServiceAccountKey
    rootFolderId: string
}

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
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

export const createGdriveClient = (deps: GdriveClientDeps) => {
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
            const text = await res.text()
            throw new Error(`Google Service Account token failed: ${res.status} ${text}`)
        }

        const data = (await res.json()) as { access_token: string; expires_in: number }
        accessToken = data.access_token
        tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
        return accessToken
    }

    const driveFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
        const token = await getAccessToken()
        return fetch(url, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, ...options.headers },
        })
    }

    return {
        upload: async (
            s3Key: string,
            body: Buffer,
            mimeType: string,
        ): Promise<{ success: true; gdriveFileId: string } | { success: false; error: string }> => {
            try {
                const metadata = JSON.stringify({
                    name: s3Key.replace(/\//g, '_'),
                    parents: [deps.rootFolderId],
                })

                const boundary = `boundary_${crypto.randomUUID()}`
                const multipartBody = Buffer.concat([
                    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
                    body,
                    Buffer.from(`\r\n--${boundary}--`),
                ])

                const res = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
                    method: 'POST',
                    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                    body: multipartBody,
                })

                if (!res.ok) {
                    const text = await res.text()
                    return { success: false, error: `Google Drive upload failed: ${res.status} ${text}` }
                }

                const data = (await res.json()) as { id: string }
                return { success: true, gdriveFileId: data.id }
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Google Drive upload failed' }
            }
        },
    }
}

export type GdriveClient = ReturnType<typeof createGdriveClient>
