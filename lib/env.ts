import { z } from 'zod'

const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    SITE_URL: z.string().url().optional(),

    BASE_URL: z.string().min(1).optional(),

    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    SPOTIFY_CLIENT_ID: z.string().min(1).optional(),
    SPOTIFY_CLIENT_SECRET: z.string().min(1).optional(),

    R2_END_POINT: z.string().url().optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_CUSTOM_DOMAIN: z.string().min(1).optional(),
    R2_CUSTOME_DOMAIN: z.string().min(1).optional(),

    KMA_API_KEY: z.string().min(1).optional(),

    DISCORD_WEBHOOK_URL: z.string().url().optional(),

    SENTRY_DSN: z.string().url().optional(),

    BETTER_AUTH_SECRET: z.string().min(1).optional(),

    TRUSTED_ORIGINS: z.string().optional(),

    MAIL_ENCRYPTION_KEY: z.string().min(32).optional(),

    GDRIVE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
    GDRIVE_ROOT_FOLDER_ID: z.string().min(1).optional(),

    UPLOAD_SERVER_SECRET: z.string().min(1).optional(),

    REDIS_URL: z.string().min(1).optional(),

    VERCEL: z.string().optional(),
    PORT: z.string().optional(),

    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof envSchema>

let cachedEnv: Env | null = null

export const getEnv = () => {
    if (cachedEnv) return cachedEnv
    const result = envSchema.safeParse(process.env)
    if (!result.success) {
        const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
        throw new Error(`Missing or invalid environment variables: ${missing}`)
    }
    cachedEnv = result.data
    return cachedEnv
}

export const resetEnvCache = () => {
    cachedEnv = null
}
