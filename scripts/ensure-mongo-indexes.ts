import { getEnv } from '../lib/env'
import { closeMongo, ensureMetricsIndexes, getMongo } from '../db/mongo'

const env = getEnv()
if (!env.MONGODB_URI) {
    console.error('MONGODB_URI is not set')
    process.exit(1)
}

const mongo = getMongo(env.MONGODB_URI)
await ensureMetricsIndexes(mongo)
const logIndexes = await mongo.logs.indexes()
const deviceIndexes = await mongo.devices.indexes()
console.log('metrics_logs indexes:', logIndexes.map((i) => i.name).join(', '))
console.log('metrics_devices indexes:', deviceIndexes.map((i) => i.name).join(', '))
await closeMongo()
