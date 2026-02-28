import { createAppError } from '../../lib/error'

type SharpInstance = {
    resize: (width: number, height?: number, options?: Record<string, unknown>) => SharpInstance
    webp: (options?: Record<string, unknown>) => SharpInstance
    png: (options?: Record<string, unknown>) => SharpInstance
    toBuffer: () => Promise<Buffer>
    metadata: () => Promise<{ width?: number; height?: number; format?: string }>
}

type SharpFn = (input: Buffer) => SharpInstance

type ImageProcessorDeps = {
    sharp: SharpFn
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024

export const createImageProcessor = (deps: ImageProcessorDeps) => {
    const toWebp = async (buffer: Buffer, quality = 80) => {
        if (buffer.length > MAX_IMAGE_SIZE) {
            throw createAppError('IMAGE_PROCESS_FAILED')
        }
        return deps.sharp(buffer).webp({ quality }).toBuffer()
    }

    const toPng = async (buffer: Buffer) => {
        if (buffer.length > MAX_IMAGE_SIZE) {
            throw createAppError('IMAGE_PROCESS_FAILED')
        }
        return deps.sharp(buffer).png().toBuffer()
    }

    const resize = async (buffer: Buffer, width: number, height?: number) => deps.sharp(buffer).resize(width, height, { fit: 'inside' }).toBuffer()

    const getMetadata = async (buffer: Buffer) => {
        const meta = await deps.sharp(buffer).metadata()
        return {
            width: meta.width ?? 0,
            height: meta.height ?? 0,
            format: meta.format ?? 'unknown',
        }
    }

    return { toWebp, toPng, resize, getMetadata }
}

export type ImageProcessor = ReturnType<typeof createImageProcessor>
