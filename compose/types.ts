import type { getDb } from '../db/index'
import type { getEnv } from '../lib/env'
import type { StorageService } from '../service/shared/storage'
import type { ImageProcessor } from '../service/shared/image-processor'
import type { GdriveStorageService } from '../service/shared/gdrive-storage'
import type { LogEventService } from '../service/domain/logs/log-event'

export type Db = ReturnType<typeof getDb>
export type Env = ReturnType<typeof getEnv>

export type ComposeCoreArgs = {
    db: Db
    env: Env
}

export type ComposeSharedArgs = ComposeCoreArgs

export type ComposeBlogArgs = ComposeCoreArgs & {
    storageService: StorageService
    imageProcessor: ImageProcessor
}

export type ComposeMailArgs = ComposeCoreArgs & {
    storageService: StorageService
}

export type ComposeWeatherArgs = ComposeCoreArgs
export type ComposeLogsArgs = ComposeCoreArgs
export type ComposeMetricsArgs = ComposeCoreArgs
export type ComposeSpotifyArgs = ComposeCoreArgs
export type ComposeResumeArgs = ComposeCoreArgs
export type ComposeCalendarArgs = ComposeCoreArgs

export type ComposeDriveArgs = ComposeCoreArgs & {
    storageService: StorageService
    imageProcessor: ImageProcessor
    gdriveStorageService: GdriveStorageService | null
    initGdriveStorage: () => Promise<GdriveStorageService | null>
}

export type ComposeAiArgs = ComposeCoreArgs & {
    storageService: StorageService
    logEventService: LogEventService
}
