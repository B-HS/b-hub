import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'

type R2ClientDeps = {
    endpoint: string
    accessKeyId: string
    secretAccessKey: string
    bucket: string
}

export const createR2Client = (deps: R2ClientDeps) => {
    const s3 = new S3Client({
        region: 'auto',
        endpoint: deps.endpoint,
        credentials: {
            accessKeyId: deps.accessKeyId,
            secretAccessKey: deps.secretAccessKey,
        },
        maxAttempts: 1,
    })

    const putBytes = async (
        key: string,
        body: Uint8Array,
        contentType: string,
    ): Promise<{ success: true; key: string } | { success: false; error: string }> => {
        try {
            await s3.send(
                new PutObjectCommand({
                    Bucket: deps.bucket,
                    Key: key,
                    Body: body,
                    ContentType: contentType,
                }),
            )
            return { success: true, key }
        } catch (error) {
            const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string }
            console.error(`[r2] upload error: name=${err.name} code=${err.Code} statusCode=${err.$metadata?.httpStatusCode} message=${err.message}`)
            return { success: false, error: error instanceof Error ? error.message : 'R2 upload failed' }
        }
    }

    return {
        upload: async (key: string, filePath: string, contentType: string) =>
            putBytes(key, new Uint8Array(readFileSync(filePath)), contentType),
        uploadBuffer: async (key: string, body: Buffer | Uint8Array, contentType: string) =>
            putBytes(key, body instanceof Buffer ? new Uint8Array(body) : body, contentType),
    }
}

export type R2Client = ReturnType<typeof createR2Client>
