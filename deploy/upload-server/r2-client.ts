import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream, statSync } from 'fs'

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
    })

    return {
        upload: async (key: string, filePath: string, contentType: string): Promise<{ success: true; key: string } | { success: false; error: string }> => {
            try {
                const fileSize = statSync(filePath).size
                const stream = createReadStream(filePath)
                await s3.send(
                    new PutObjectCommand({
                        Bucket: deps.bucket,
                        Key: key,
                        Body: stream,
                        ContentType: contentType,
                        ContentLength: fileSize,
                    }),
                )
                return { success: true, key }
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'R2 upload failed' }
            }
        },
    }
}

export type R2Client = ReturnType<typeof createR2Client>
