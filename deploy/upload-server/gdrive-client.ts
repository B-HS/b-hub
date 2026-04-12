type GdriveClientDeps = {
    clientId: string
    clientSecret: string
    refreshToken: string
    rootFolderId: string
}

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const createGdriveClient = (deps: GdriveClientDeps) => {
    let accessToken: string | null = null
    let tokenExpiresAt = 0

    const getAccessToken = async (): Promise<string> => {
        if (accessToken && Date.now() < tokenExpiresAt) return accessToken

        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: deps.clientId,
                client_secret: deps.clientSecret,
                refresh_token: deps.refreshToken,
                grant_type: 'refresh_token',
            }),
        })

        if (!res.ok) {
            const text = await res.text()
            throw new Error(`Google OAuth token refresh failed: ${res.status} ${text}`)
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
