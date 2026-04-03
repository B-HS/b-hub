import { getDb } from '../db/index'
import { getEnv } from '../lib/env'
import { composeShared } from './shared'
import { composeBlog } from './blog'
import { composeHn } from './hn'
import { composeWeather } from './weather'
import { composeMail } from './mail'
import { composeSpotify } from './spotify'
import { composeResume } from './resume'
import { composeCalendar } from './calendar'
import { composeDrive } from './drive'

export const compose = () => {
    const env = getEnv()
    const db = getDb()
    const core = { db, env }

    const shared = composeShared(core)
    const blog = composeBlog({ ...core, storageService: shared.storageService, imageProcessor: shared.imageProcessor })
    const hn = composeHn(core)
    const weather = composeWeather(core)
    const mail = composeMail({ ...core, storageService: shared.storageService })
    const spotify = composeSpotify(core)
    const resume = composeResume(core)
    const calendar = composeCalendar(core)
    const drive = composeDrive({ ...core, storageService: shared.storageService, imageProcessor: shared.imageProcessor })

    return {
        ...shared,
        ...blog,
        ...hn,
        ...weather,
        ...mail,
        ...spotify,
        ...resume,
        ...calendar,
        ...drive,
        cronSecret: env.CRON_SECRET ?? '',
        baseUrl: env.BASE_URL ?? '',
    }
}
