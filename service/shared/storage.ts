import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsCommand, type S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createAppError } from '../../lib/error'

type StorageDeps = {
    s3: S3Client
    bucket: string
    cdnDomain: string
}

export const createStorageService = (deps: StorageDeps) => {
    const upload = async (key: string, body: Buffer | Uint8Array, contentType: string) => {
        try {
            const command = new PutObjectCommand({
                Bucket: deps.bucket,
                Key: key,
                Body: body instanceof Buffer ? new Uint8Array(body) : body,
                ContentType: contentType,
            })
            await deps.s3.send(command)
            return { key, url: `${deps.cdnDomain}/${key}` }
        } catch (error) {
            throw createAppError('STORAGE_UPLOAD_FAILED')
        }
    }

    const del = async (key: string) => {
        try {
            const command = new DeleteObjectCommand({
                Bucket: deps.bucket,
                Key: key,
            })
            await deps.s3.send(command)
        } catch (error) {
            throw createAppError('STORAGE_DELETE_FAILED')
        }
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

    const getPresignedUrl = async (key: string, expiresIn = 300) => {
        try {
            const command = new GetObjectCommand({
                Bucket: deps.bucket,
                Key: key,
            })
            return await getSignedUrl(deps.s3, command, { expiresIn })
        } catch (error) {
            throw createAppError('STORAGE_PRESIGN_FAILED')
        }
    }

    const getObject = async (key: string) => {
        try {
            const command = new GetObjectCommand({
                Bucket: deps.bucket,
                Key: key,
            })
            const result = await deps.s3.send(command)
            if (!result.Body) return null
            const bytes = await result.Body.transformToByteArray()
            return Buffer.from(bytes)
        } catch (error) {
            return null
        }
    }

    return { upload, del, list, getUrl, getPresignedUrl, getObject }
}

export type StorageService = ReturnType<typeof createStorageService>
