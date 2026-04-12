import { createAppError } from '../../lib/error'

type GdriveStorageDeps = {
    clientId: string
    clientSecret: string
    refreshToken: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

export const createGdriveStorageService = (deps: GdriveStorageDeps) => {
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
            const res = await fetch(`${DRIVE_API}/files/${gdriveFileId}?alt=media&supportsAllDrives=true`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!res.ok || !res.body) {
                throw createAppError('DRIVE_L3_DOWNLOAD_FAILED')
            }

            return res.body
        },

        del: async (gdriveFileId: string): Promise<void> => {
            const token = await getAccessToken()
            const res = await fetch(`${DRIVE_API}/files/${gdriveFileId}?supportsAllDrives=true`, {
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
