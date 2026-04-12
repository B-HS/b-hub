const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

export const createGdriveClient = () => ({
    upload: async (
        accessToken: string,
        rootFolderId: string,
        s3Key: string,
        body: Buffer,
        mimeType: string,
    ): Promise<{ success: true; gdriveFileId: string } | { success: false; error: string }> => {
        try {
            const metadata = JSON.stringify({
                name: s3Key.replace(/\//g, '_'),
                parents: [rootFolderId],
            })

            const boundary = `boundary_${crypto.randomUUID()}`
            const multipartBody = Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
                body,
                Buffer.from(`\r\n--${boundary}--`),
            ])

            const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                },
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
})

export type GdriveClient = ReturnType<typeof createGdriveClient>
