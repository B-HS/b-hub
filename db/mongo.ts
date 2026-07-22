import { MongoClient } from 'mongodb'
import { captureException } from '../lib/sentry'

const MONGO_DB_NAME = 'metrics'
const LOG_TTL_DAYS = 90
const DAY_SECONDS = 86400

export type MetricsLogDoc = {
    tokenId: number
    tokenAlias: string
    deviceId: string
    hostname: string | null
    os: string | null
    arch: string | null
    agentVersion: string | null
    payload: Record<string, unknown>
    receivedAt: Date
}

export type MetricsDeviceDoc = {
    deviceId: string
    tokenId: number
    tokenAlias: string
    hostname: string | null
    os: string | null
    arch: string | null
    agentVersion: string | null
    intervalSec: number | null
    firstSeenAt: Date
    lastSeenAt: Date
    downAlertedAt: Date | null
}

const createMongo = (uri: string) => {
    const client = new MongoClient(uri)
    const db = client.db(MONGO_DB_NAME)
    const logs = db.collection<MetricsLogDoc>('metrics_logs')
    const devices = db.collection<MetricsDeviceDoc>('metrics_devices')

    Promise.all([
        logs.createIndex({ receivedAt: 1 }, { expireAfterSeconds: LOG_TTL_DAYS * DAY_SECONDS }),
        logs.createIndex({ tokenId: 1, receivedAt: -1 }),
        logs.createIndex({ deviceId: 1, receivedAt: -1 }),
        devices.createIndex({ deviceId: 1 }, { unique: true }),
    ]).catch((e) => captureException(e))

    return { client, db, logs, devices }
}

let mongoInstance: ReturnType<typeof createMongo> | null = null

export const getMongo = (uri: string) => {
    if (mongoInstance) return mongoInstance
    mongoInstance = createMongo(uri)
    return mongoInstance
}

export const closeMongo = async () => {
    if (mongoInstance) {
        await mongoInstance.client.close()
        mongoInstance = null
    }
}

export type Mongo = ReturnType<typeof getMongo>
