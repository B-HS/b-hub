import { createReadStream, statSync } from 'fs'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

const FOLDER_CACHE_MAX_ENTRIES = 500

/**
 * Bounded LRU cache: reading or writing a key marks it most recently used,
 * and the least recently used entry is evicted once maxEntries is exceeded.
 */
export const createBoundedLruCache = (maxEntries: number) => {
    const entries = new Map<string, string>()

    return {
        get: (key: string) => {
            const value = entries.get(key)
            if (value === undefined) return undefined
            entries.delete(key)
            entries.set(key, value)
            return value
        },
        set: (key: string, value: string) => {
            entries.delete(key)
            entries.set(key, value)
            while (entries.size > maxEntries) {
                const oldestKey = entries.keys().next().value
                if (oldestKey === undefined) break
                entries.delete(oldestKey)
            }
        },
        has: (key: string) => entries.has(key),
        get size() {
            return entries.size
        },
    }
}

const folderCache = createBoundedLruCache(FOLDER_CACHE_MAX_ENTRIES)

const ensureFolder = async (accessToken: string, parentId: string, folderName: string): Promise<string> => {
    const cacheKey = `${parentId}/${folderName}`
    const cached = folderCache.get(cacheKey)
    if (cached) return cached

    const searchRes = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const searchData = (await searchRes.json()) as { files: { id: string }[] }

    if (searchData.files.length > 0) {
        folderCache.set(cacheKey, searchData.files[0].id)
        return searchData.files[0].id
    }

    const createRes = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        }),
    })

    if (!createRes.ok) {
        const text = await createRes.text()
        throw new Error(`Google Drive folder creation failed: ${createRes.status} ${text}`)
    }

    const createData = (await createRes.json()) as { id: string }
    folderCache.set(cacheKey, createData.id)
    return createData.id
}

const ensureFolderPath = async (accessToken: string, rootFolderId: string, pathParts: string[]): Promise<string> => {
    let currentId = rootFolderId
    for (const part of pathParts) {
        currentId = await ensureFolder(accessToken, currentId, part)
    }
    return currentId
}

export const createGdriveClient = () => ({
    upload: async (
        accessToken: string,
        rootFolderId: string,
        s3Key: string,
        filePath: string,
        mimeType: string,
    ): Promise<{ success: true; gdriveFileId: string } | { success: false; error: string }> => {
        try {
            const parts = s3Key.split('/')
            const fileName = parts.pop()!
            const folderParts = parts

            const parentFolderId = folderParts.length > 0 ? await ensureFolderPath(accessToken, rootFolderId, folderParts) : rootFolderId

            const fileSize = statSync(filePath).size
            const metadata = JSON.stringify({
                name: fileName,
                parents: [parentFolderId],
            })

            const boundary = `boundary_${crypto.randomUUID()}`
            const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
            const endPart = `\r\n--${boundary}--`
            const totalSize = Buffer.byteLength(metaPart) + fileSize + Buffer.byteLength(endPart)

            const fileStream = createReadStream(filePath)

            const bodyStream = new ReadableStream({
                async start(controller) {
                    controller.enqueue(new TextEncoder().encode(metaPart))

                    for await (const chunk of fileStream) {
                        controller.enqueue(chunk instanceof Buffer ? new Uint8Array(chunk) : chunk)
                    }

                    controller.enqueue(new TextEncoder().encode(endPart))
                    controller.close()
                },
            })

            const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'Content-Length': String(totalSize),
                },
                body: bodyStream,
                // @ts-expect-error Bun supports duplex streaming
                duplex: 'half',
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
