import { getDb } from '../db/index'
import { getEnv } from '../lib/env'
import { composeShared } from './shared'
import { composeBlog } from './blog'
import { composeWeather } from './weather'
import { composeLogs } from './logs'
import { composeMail } from './mail'
import { composeSpotify } from './spotify'
import { composeResume } from './resume'
import { composeCalendar } from './calendar'
import { composeDrive } from './drive'
import { composeAi } from './ai'
import { composeMetrics } from './metrics'
import { createRedisRateLimitStore } from '../service/shared/rate-limit-store'

export const compose = () => {
    const env = getEnv()
    const db = getDb()
    const core = { db, env }
    const rateLimitStore = env.REDIS_URL ? createRedisRateLimitStore({ url: env.REDIS_URL }) : undefined

    const shared = composeShared(core)
    const blog = composeBlog({ ...core, storageService: shared.storageService, imageProcessor: shared.imageProcessor })
    const weather = composeWeather(core)
    const logs = composeLogs(core)
    const mail = composeMail({ ...core, storageService: shared.storageService, rateLimitStore })
    const spotify = composeSpotify(core)
    const resume = composeResume(core)
    const calendar = composeCalendar(core)
    const drive = composeDrive({
        ...core,
        storageService: shared.storageService,
        imageProcessor: shared.imageProcessor,
        gdriveStorageService: null,
        initGdriveStorage: shared.initGdriveStorage,
    })
    const ai = composeAi({ ...core, storageService: shared.storageService, logEventService: logs.logEventService, rateLimitStore })
    const metrics = composeMetrics({ ...core, storageService: shared.storageService })

    return {
        ...shared,
        ...blog,
        ...weather,
        ...logs,
        ...mail,
        ...spotify,
        ...resume,
        ...calendar,
        ...drive,
        ...ai,
        ...metrics,
        isProduction: env.NODE_ENV === 'production',
        baseUrl: env.BASE_URL ?? '',
        gdriveRootFolderId: env.GDRIVE_ROOT_FOLDER_ID ?? '',
    }
}
