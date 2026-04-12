import { S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createGdriveStorageService } from '../service/shared/gdrive-storage'
import { createAuthProvider } from '../service/shared/auth-provider'
import { createApiTokenService } from '../service/shared/api-token'
import { createStorageService } from '../service/shared/storage'
import { createImageProcessor } from '../service/shared/image-processor'
import { createImageGenerator } from '../service/shared/image-generator'
import { createFontLoader } from '../service/shared/font-loader'
import { createIconLoader } from '../service/shared/icon-loader'
import { createCache } from '../service/shared/cache'
import { createBadgeService } from '../service/domain/badge/badge'
import { convertTailwindToCSS, mergeStyles } from '../lib/tailwind-converter'
import type { ComposeSharedArgs } from './types'

export const composeShared = ({ db, env }: ComposeSharedArgs) => {
    const auth = createAuthProvider({
        db,
        baseUrl: env.BASE_URL ?? 'http://localhost:9999',
        githubClientId: env.GITHUB_CLIENT_ID ?? '',
        githubClientSecret: env.GITHUB_CLIENT_SECRET ?? '',
        googleClientId: env.GOOGLE_CLIENT_ID ?? '',
        googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
        secret: env.BETTER_AUTH_SECRET,
        trustedOrigins: env.TRUSTED_ORIGINS?.split(',') ?? [],
    })

    const getSession = async (c: { req: { raw: { headers: Headers } } }) => {
        const session = await auth.api.getSession({ headers: c.req.raw.headers })
        if (!session) return null
        return {
            user: {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                role: (session.user as Record<string, unknown>).role as string | null,
                image: session.user.image ?? null,
            },
        }
    }

    const apiTokenService = createApiTokenService({ db })

    const s3 = new S3Client({
        region: 'auto',
        endpoint: env.R2_END_POINT,
        credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
        },
    })

    const storageService = createStorageService({
        s3,
        bucket: env.R2_BUCKET ?? 'blog-cloud',
        cdnDomain: env.R2_CUSTOM_DOMAIN ?? env.R2_CUSTOME_DOMAIN ?? 'https://blogimg.gumyo.net',
    })

    const imageProcessor = createImageProcessor({ sharp })

    const fontLoader = createFontLoader()

    const basePath = env.VERCEL ? '/var/task' : process.cwd()
    const wasmPath = join(basePath, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')

    const imageGenerator = createImageGenerator({
        satori: satori as never,
        initWasm: initWasm as never,
        Resvg: Resvg as never,
        loadWasm: () => readFile(wasmPath).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
    })

    const iconLoader = createIconLoader()
    const badgeCache = createCache<Buffer>({ maxSize: 200, defaultTtlMs: 24 * 60 * 60 * 1000 })
    const badgeService = createBadgeService({
        imageGenerator,
        fontLoader,
        iconLoader,
        cache: badgeCache,
        convertTailwindToCSS,
        mergeStyles,
    })

    const gdriveStorageService = env.GDRIVE_SERVICE_ACCOUNT_KEY
        ? createGdriveStorageService({
              serviceAccountKey: JSON.parse(env.GDRIVE_SERVICE_ACCOUNT_KEY),
          })
        : null

    return {
        auth,
        getSession,
        apiTokenService,
        storageService,
        imageProcessor,
        imageGenerator,
        fontLoader,
        badgeService,
        gdriveStorageService,
    }
}
