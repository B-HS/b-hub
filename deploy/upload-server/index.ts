import { Hono } from 'hono'
import { cors } from 'hono/cors'
import sharp from 'sharp'
import { createR2Client } from './r2-client'
import { createGdriveClient } from './gdrive-client'
import { createLocalClient } from './local-client'
import { createUploadHandler } from './upload-handler'

const env = {
    PORT: Number(process.env.PORT ?? 4100),
    HUB_BASE_URL: process.env.HUB_BASE_URL ?? 'https://api.gumyo.net',
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ?? 'https://gumyo.net,https://hyns.dev').split(','),
    MAX_UPLOAD_SIZE_BYTES: Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 100 * 1024 * 1024 * 1024),

    R2_END_POINT: process.env.R2_END_POINT ?? '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
    R2_BUCKET: process.env.R2_BUCKET ?? 'blog-cloud',

    GDRIVE_SERVICE_ACCOUNT_KEY: process.env.GDRIVE_SERVICE_ACCOUNT_KEY ?? '{}',
    GDRIVE_ROOT_FOLDER_ID: process.env.GDRIVE_ROOT_FOLDER_ID ?? '',
}

const L1_MAX_FILE_SIZE = 100 * 1024 * 1024

const r2 = createR2Client({
    endpoint: env.R2_END_POINT,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
})

const gdrive = createGdriveClient({
    serviceAccountKey: JSON.parse(env.GDRIVE_SERVICE_ACCOUNT_KEY),
    rootFolderId: env.GDRIVE_ROOT_FOLDER_ID,
})

const local = createLocalClient()

const imageProcessor = {
    resize: (buffer: Buffer, width: number, height?: number) => sharp(buffer).resize(width, height, { fit: 'inside' }).toBuffer(),
    toWebp: (buffer: Buffer, quality = 80) => sharp(buffer).webp({ quality }).toBuffer(),
}

const handler = createUploadHandler({
    r2,
    gdrive,
    local,
    hubBaseUrl: env.HUB_BASE_URL,
    generateId: () => crypto.randomUUID(),
    l1MaxFileSize: L1_MAX_FILE_SIZE,
    imageProcessor,
})

const app = new Hono()

app.use(
    '*',
    cors({
        origin: (origin) => (env.ALLOWED_ORIGINS.some((o) => origin === o || origin.endsWith(`.${new URL(o).hostname}`)) ? origin : ''),
        credentials: true,
    }),
)

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.post('/upload', async (c) => {
    const origin = c.req.header('Origin') ?? 'unknown'
    console.log(`[request] POST /upload from ${origin}`)

    const formData = await c.req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
        console.warn(`[request] rejected: no file provided`)
        return c.json({ success: false, error: 'No file provided' }, 400)
    }

    if (file.size > env.MAX_UPLOAD_SIZE_BYTES) {
        console.warn(`[request] rejected: file too large (${file.size} bytes)`)
        return c.json({ success: false, error: 'File too large' }, 413)
    }

    const assetId = Number(formData.get('assetId'))
    const s3Key = formData.get('s3Key') as string
    const uploadToken = formData.get('uploadToken') as string

    if (!assetId || !s3Key || !uploadToken) {
        console.warn(`[request] rejected: missing params assetId=${assetId} s3Key=${!!s3Key} uploadToken=${!!uploadToken}`)
        return c.json({ success: false, error: 'Missing assetId, s3Key, or uploadToken' }, 400)
    }

    const result = await handler.handle(file, assetId, s3Key, uploadToken)

    if (!result.success) {
        console.error(`[request] failed: ${result.message}`)
        return c.json({ success: false, error: result.message }, 500)
    }

    return c.json({ success: true, message: result.message })
})

console.log(`Upload server running on port ${env.PORT}`)

export default {
    port: env.PORT,
    fetch: app.fetch,
}
