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
