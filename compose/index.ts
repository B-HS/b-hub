import { getDb } from '../db/index'
import { getEnv } from '../lib/env'
import { composeShared } from './shared'
import { composeBlog } from './blog'
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
    const weather = composeWeather(core)
    const mail = composeMail({ ...core, storageService: shared.storageService })
    const spotify = composeSpotify(core)
    const resume = composeResume(core)
    const calendar = composeCalendar(core)
    const drive = composeDrive({ ...core, storageService: shared.storageService, imageProcessor: shared.imageProcessor, gdriveStorageService: null, initGdriveStorage: shared.initGdriveStorage })

    return {
        ...shared,
        ...blog,
        ...weather,
        ...mail,
        ...spotify,
        ...resume,
        ...calendar,
        ...drive,
        baseUrl: env.BASE_URL ?? '',
    }
}
