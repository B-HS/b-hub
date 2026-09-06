const DEFAULT_BATCH_SIZE = 100

export const batchInsert = async <T>(items: T[], inserter: (batch: T[]) => Promise<void>, batchSize = DEFAULT_BATCH_SIZE) => {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await inserter(batch)
    }
}

export const chunkArray = <T>(items: T[], size: number): T[][] => {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }
    return chunks
}

const DUPLICATE_KEY_ERROR_CODE = 'ER_DUP_ENTRY'

const hasErrorCode = (value: unknown, code: string) => typeof value === 'object' && value !== null && 'code' in value && value.code === code

/**
 * Detects a MySQL unique-key violation, including the case where drizzle wraps
 * the driver error in DrizzleQueryError with the original error as `cause`.
 */
export const isDuplicateKeyError = (error: unknown) =>
    hasErrorCode(error, DUPLICATE_KEY_ERROR_CODE) ||
    (typeof error === 'object' && error !== null && 'cause' in error && hasErrorCode(error.cause, DUPLICATE_KEY_ERROR_CODE))
