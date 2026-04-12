import { S3Client } from '@aws-sdk/client-s3'
import { eq, and } from 'drizzle-orm'
import sharp from 'sharp'
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFile } from 'fs/promises'
import { join } from 'path'
import * as schema from '../db/schema'
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

    const getGdriveRefreshToken = async (): Promise<string | null> => {
        if (!env.GDRIVE_OWNER_EMAIL) return null
        const [row] = await db
            .select({ refreshToken: schema.account.refreshToken })
            .from(schema.account)
            .innerJoin(schema.user, eq(schema.account.userId, schema.user.id))
            .where(and(eq(schema.user.email, env.GDRIVE_OWNER_EMAIL), eq(schema.account.providerId, 'google')))
            .limit(1)
        return row?.refreshToken ?? null
    }

    let gdriveStorageService: ReturnType<typeof createGdriveStorageService> | null = null
    const initGdriveStorage = async () => {
        if (gdriveStorageService) return gdriveStorageService
        const refreshToken = await getGdriveRefreshToken()
        if (!refreshToken || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null
        gdriveStorageService = createGdriveStorageService({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            refreshToken,
        })
        return gdriveStorageService
    }

    return {
        auth,
        getSession,
        apiTokenService,
        storageService,
        imageProcessor,
        imageGenerator,
        fontLoader,
        badgeService,
        gdriveStorageService: null as ReturnType<typeof createGdriveStorageService> | null,
        initGdriveStorage,
    }
}
