type ServiceAccountKey = {
    client_email: string
    private_key: string
    token_uri: string
}

type GdriveClientDeps = {
    serviceAccountKey: ServiceAccountKey
    rootFolderId: string
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

const base64url = (data: Uint8Array | string): string => {
    const str = typeof data === 'string' ? btoa(data) : btoa(String.fromCharCode(...data))
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
    const pemBody = pem.replace(/-----BEGIN RSA PRIVATE KEY-----/g, '').replace(/-----END RSA PRIVATE KEY-----/g, '').replace(/\s/g, '')
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
    const userFolderCache = new Map<string, string>()

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

    const ensureUserFolder = async (userId: string): Promise<string> => {
        const cached = userFolderCache.get(userId)
        if (cached) return cached

        const searchRes = await driveFetch(
            `${DRIVE_API}/files?q=${encodeURIComponent(`'${deps.rootFolderId}' in parents and name='${userId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`,
        )
        const searchData = (await searchRes.json()) as { files: { id: string }[] }

        if (searchData.files.length > 0) {
            userFolderCache.set(userId, searchData.files[0].id)
            return searchData.files[0].id
        }

        const createRes = await driveFetch(`${DRIVE_API}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: userId,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [deps.rootFolderId],
            }),
        })

        if (!createRes.ok) {
            const text = await createRes.text()
            throw new Error(`Google Drive folder creation failed: ${createRes.status} ${text}`)
        }

        const createData = (await createRes.json()) as { id: string }
        userFolderCache.set(userId, createData.id)
        return createData.id
    }

    return {
        upload: async (
            userId: string,
            fileName: string,
            body: Buffer,
            mimeType: string,
        ): Promise<{ success: true; gdriveFileId: string } | { success: false; error: string }> => {
            try {
                const folderId = await ensureUserFolder(userId)

                const metadata = JSON.stringify({
                    name: fileName,
                    parents: [folderId],
                })

                const boundary = `boundary_${crypto.randomUUID()}`
                const multipartBody = Buffer.concat([
                    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
                    body,
                    Buffer.from(`\r\n--${boundary}--`),
                ])

                const res = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
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
