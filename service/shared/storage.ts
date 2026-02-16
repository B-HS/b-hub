import { PutObjectCommand, DeleteObjectCommand, ListObjectsCommand, type S3Client } from '@aws-sdk/client-s3'

type StorageDeps = {
    s3: S3Client
    bucket: string
    cdnDomain: string
}

export const createStorageService = (deps: StorageDeps) => {
    const upload = async (key: string, body: Buffer | Uint8Array, contentType: string) => {
        const command = new PutObjectCommand({
            Bucket: deps.bucket,
            Key: key,
            Body: body instanceof Buffer ? new Uint8Array(body) : body,
            ContentType: contentType,
        })
        await deps.s3.send(command)
        return { key, url: `${deps.cdnDomain}/${key}` }
    }

    const del = async (key: string) => {
        const command = new DeleteObjectCommand({
            Bucket: deps.bucket,
            Key: key,
        })
        await deps.s3.send(command)
    }

    const list = async (prefix?: string) => {
        const command = new ListObjectsCommand({
            Bucket: deps.bucket,
            Prefix: prefix,
        })
        const result = await deps.s3.send(command)
        return result.Contents ?? []
    }

    const getUrl = (key: string) => `${deps.cdnDomain}/${key}`

    return { upload, del, list, getUrl }
}

export type StorageService = ReturnType<typeof createStorageService>
