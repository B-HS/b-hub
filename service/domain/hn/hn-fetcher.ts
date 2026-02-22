const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0'

type StoryType = 'top' | 'best' | 'new'

type HNItem = {
    id: number
    type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt'
    by?: string
    title?: string
    url?: string
    text?: string
    score?: number
    descendants?: number
    time?: number
    kids?: number[]
    parent?: number
    dead?: boolean
    deleted?: boolean
}

type HnFetcherDeps = {
    fetchFn?: typeof fetch
    db: {
        getExistingStoryIds: (ids: number[]) => Promise<{ id: number; score: number | null; descendants: number | null }[]>
        upsertStory: (data: Record<string, unknown>) => Promise<void>
        updateStoryMeta: (id: number, data: { score: number; descendants: number; needsResummarize: boolean }) => Promise<void>
        deleteCommentsByStoryId: (storyId: number) => Promise<void>
        insertCommentsBatch: (comments: Record<string, unknown>[]) => Promise<void>
        getUnsummarizedStories: (limit: number) => Promise<Record<string, unknown>[]>
        getStoriesForPeriod: (startTime: number, endTime: number, limit: number) => Promise<Record<string, unknown>[]>
        markStorySummarized: (storyId: number) => Promise<void>
        getCommentsByStoryId: (storyId: number) => Promise<Record<string, unknown>[]>
        getStoriesPaginated: (type: string | undefined, limit: number, offset: number) => Promise<Record<string, unknown>[]>
        getStoryById: (id: number) => Promise<Record<string, unknown> | null>
        searchStories: (q: string, limit: number) => Promise<Record<string, unknown>[]>
        getSummariesByStoryIds: (ids: number[]) => Promise<Record<string, unknown>[]>
        getSummaryByStoryId: (id: number) => Promise<Record<string, unknown> | null>
        getAllTags: () => Promise<Record<string, unknown>[]>
        getStoriesByTagName: (
            name: string,
            limit: number,
            offset: number,
        ) => Promise<{
            stories: Record<string, unknown>[]
            summaries: Record<string, unknown>[]
        }>
    }
    translator?: {
        translateBatch: (
            items: {
                id: number
                title: string
                storyText: string | null
                content: string | null
            }[],
            existingTags: string[],
        ) => Promise<
            {
                id: number
                titleKo: string
                storyTextKo?: string
                contentSummary?: string
                contentSummaryKo?: string
                tags: string[]
            }[]
        >
        getExistingTags: () => Promise<string[]>
        updateTagUsage: (tags: string[]) => Promise<void>
    }
    contentParser?: {
        parse: (url: string) => Promise<{ success: boolean; content?: string; error?: string }>
    }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const createHnFetcherService = (deps: HnFetcherDeps) => {
    const fetchFn = deps.fetchFn ?? fetch

    const fetchStoryIds = async (type: StoryType) => {
        const endpoint = type === 'top' ? 'topstories' : type === 'best' ? 'beststories' : 'newstories'
        const response = await fetchFn(`${HN_API_BASE}/${endpoint}.json`)
        return (await response.json()) as number[]
    }

    const fetchItem = async (id: number): Promise<HNItem | null> => {
        try {
            const response = await fetchFn(`${HN_API_BASE}/item/${id}.json`)
            return (await response.json()) as HNItem
        } catch {
            return null
        }
    }

    const fetchItemsBatch = async (ids: number[], batchSize = 10) => {
        const results: (HNItem | null)[] = []

        for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize)
            const batchResults = await Promise.all(batch.map(fetchItem))
            results.push(...batchResults)

            if (i + batchSize < ids.length) {
                await delay(100)
            }
        }

        return results
    }

    const fetchCommentsRecursive = async (storyId: number, kids: number[], depth: number, maxDepth: number): Promise<Record<string, unknown>[]> => {
        if (depth >= maxDepth || kids.length === 0) return []

        const items = await fetchItemsBatch(kids)
        const commentsList: Record<string, unknown>[] = []

        for (const item of items) {
            if (!item || item.type !== 'comment') continue

            commentsList.push({
                id: item.id,
                storyId,
                parentId: item.parent ?? null,
                by: item.by ?? null,
                commentText: item.text ?? null,
                time: item.time ?? null,
                depth,
                dead: item.dead ?? false,
                deleted: item.deleted ?? false,
            })

            if (item.kids && item.kids.length > 0) {
                const childComments = await fetchCommentsRecursive(storyId, item.kids, depth + 1, maxDepth)
                commentsList.push(...childComments)
            }
        }

        return commentsList
    }

    const syncStories = async (type: StoryType, limit = 100) => {
        const storyIds = await fetchStoryIds(type)
        const targetIds = storyIds.slice(0, limit)

        const existingStories = await deps.db.getExistingStoryIds(targetIds)
        const existingMap = new Map(existingStories.map((s) => [s.id, s]))

        const items = await fetchItemsBatch(targetIds)

        const newItems: HNItem[] = []
        const updateItems: HNItem[] = []

        for (const item of items) {
            if (!item || !['story', 'job', 'poll'].includes(item.type)) continue
            if (existingMap.has(item.id)) {
                updateItems.push(item)
            } else {
                newItems.push(item)
            }
        }

        let synced = 0
        let updated = 0
        let parsed = 0

        for (const item of updateItems) {
            const existing = existingMap.get(item.id)!

            await deps.db.updateStoryMeta(item.id, {
                score: item.score ?? 0,
                descendants: item.descendants ?? 0,
                needsResummarize: false,
            })

            if (item.score !== existing.score || item.descendants !== existing.descendants) updated++
        }

        if (newItems.length > 0) {
            const urlContents = new Map<number, string>()

            if (deps.contentParser) {
                for (const item of newItems) {
                    if (item.url) {
                        const parseResult = await deps.contentParser.parse(item.url)
                        if (parseResult.success && parseResult.content) {
                            urlContents.set(item.id, parseResult.content)
                            parsed++
                        }
                    }
                }
            }

            let translationMap = new Map<
                number,
                {
                    titleKo: string
                    storyTextKo?: string
                    contentSummary?: string
                    contentSummaryKo?: string
                    tags: string[]
                }
            >()

            if (deps.translator) {
                const existingTags = await deps.translator.getExistingTags()
                const storyInputs = newItems.map((item) => ({
                    id: item.id,
                    title: item.title ?? '',
                    storyText: item.text ?? null,
                    content: urlContents.get(item.id) ?? null,
                }))

                const translations = await deps.translator.translateBatch(storyInputs, existingTags)
                translationMap = new Map(translations.map((t) => [t.id, t]))

                const allTags = translations.flatMap((t) => t.tags)
                if (allTags.length > 0) {
                    await deps.translator.updateTagUsage([...new Set(allTags)])
                }
            }

            for (const item of newItems) {
                const translation = translationMap.get(item.id)

                await deps.db.upsertStory({
                    id: item.id,
                    type,
                    hnType: item.type,
                    by: item.by ?? null,
                    title: item.title ?? null,
                    titleKo: translation?.titleKo ?? null,
                    url: item.url ?? null,
                    storyText: item.text ?? null,
                    storyTextKo: translation?.storyTextKo ?? null,
                    contentSummary: translation?.contentSummary ?? null,
                    contentSummaryKo: translation?.contentSummaryKo ?? null,
                    tags: translation?.tags ?? [],
                    contentParsed: urlContents.has(item.id),
                    score: item.score ?? 0,
                    descendants: item.descendants ?? 0,
                    time: item.time ?? null,
                    dead: item.dead ?? false,
                    deleted: item.deleted ?? false,
                    needsResummarize: true,
                })
                synced++

                if (item.kids && item.kids.length > 0) {
                    const commentsList = await fetchCommentsRecursive(item.id, item.kids, 0, 50)
                    if (commentsList.length > 0) {
                        await deps.db.deleteCommentsByStoryId(item.id)
                        for (let i = 0; i < commentsList.length; i += 100) {
                            await deps.db.insertCommentsBatch(commentsList.slice(i, i + 100))
                        }
                    }
                }
            }
        }

        return { synced, updated, parsed }
    }

    const syncAllTypes = async () => {
        const topResult = await syncStories('top', 30)
        const bestResult = await syncStories('best', 20)
        const newResult = await syncStories('new', 50)

        return { top: topResult, best: bestResult, new: newResult }
    }

    return {
        fetchStoryIds,
        fetchItem,
        fetchItemsBatch,
        fetchCommentsRecursive,
        syncStories,
        syncAllTypes,
    }
}

export type HnFetcherService = ReturnType<typeof createHnFetcherService>
