import { MongoClient } from 'mongodb'

const MONGO_DB_NAME = 'metrics'
const LOG_TTL_DAYS = 90
const DAY_SECONDS = 86400
const SERVER_SELECTION_TIMEOUT_MS = 8000
const CONNECT_TIMEOUT_MS = 8000
const MAX_POOL_SIZE = 5

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
}

const createMongo = (uri: string) => {
    const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
        connectTimeoutMS: CONNECT_TIMEOUT_MS,
        maxPoolSize: MAX_POOL_SIZE,
    })
    const db = client.db(MONGO_DB_NAME)
    const logs = db.collection<MetricsLogDoc>('metrics_logs')
    const devices = db.collection<MetricsDeviceDoc>('metrics_devices')

    return { client, db, logs, devices }
}

let mongoInstance: ReturnType<typeof createMongo> | null = null

export const getMongo = (uri: string) => {
    if (mongoInstance) return mongoInstance
    mongoInstance = createMongo(uri)
    return mongoInstance
}

export const resetMongo = async () => {
    const instance = mongoInstance
    mongoInstance = null
    if (instance) await instance.client.close().catch(() => undefined)
}

export const closeMongo = async () => {
    if (mongoInstance) {
        await mongoInstance.client.close()
        mongoInstance = null
    }
}

const CLOSED_CLIENT_ERROR_NAMES = ['MongoTopologyClosedError', 'MongoNotConnectedError']
const CLOSED_CLIENT_ERROR_MESSAGES = ['Topology is closed', 'Client must be connected']

export const isMongoClientClosed = (error: unknown) =>
    error instanceof Error && (CLOSED_CLIENT_ERROR_NAMES.includes(error.name) || CLOSED_CLIENT_ERROR_MESSAGES.some((m) => error.message.includes(m)))

export const ensureMetricsIndexes = async (mongo: ReturnType<typeof createMongo>) => {
    await Promise.all([
        mongo.logs.createIndex({ receivedAt: 1 }, { expireAfterSeconds: LOG_TTL_DAYS * DAY_SECONDS }),
        mongo.logs.createIndex({ tokenId: 1, receivedAt: -1 }),
        mongo.logs.createIndex({ deviceId: 1, receivedAt: -1 }),
        mongo.devices.createIndex({ deviceId: 1 }, { unique: true }),
    ])
}

export type Mongo = ReturnType<typeof getMongo>
