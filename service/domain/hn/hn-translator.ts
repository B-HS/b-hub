type TranslatorDeps = {
    ai: {
        summarize: (prompt: string, maxTokens?: number) => Promise<string>
    }
    db: {
        getExistingTags: () => Promise<string[]>
        updateTagUsage: (tags: string[]) => Promise<void>
    }
}

type StoryInput = {
    id: number
    title: string
    storyText: string | null
    content: string | null
}

type StoryTranslation = {
    id: number
    titleKo: string
    storyTextKo?: string
    contentSummary?: string
    contentSummaryKo?: string
    tags: string[]
}

const DEFAULT_TAGS = [
    'AI/ML',
    'Web',
    'Backend',
    'Frontend',
    'DevOps',
    'Security',
    'Database',
    'Mobile',
    'Startup',
    'Open Source',
    'Programming',
    'Cloud',
    'Hardware',
    'Science',
    'Career',
    'Productivity',
    'Design',
    'Data',
    'Blockchain',
    'Gaming',
]

const BATCH_SIZE = 5
const BATCH_DELAY = 3000
const MAX_RETRIES = 3
const RETRY_DELAY = 5000

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const safeJsonParse = (text: string, storyInputs: StoryInput[]): StoryTranslation[] => {
    const jsonMatch = text.match(/\[[\s\S]*\]/)

    if (!jsonMatch) {
        console.error('[Translator] No JSON array found in response')
        return []
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
            idx: number
            titleKo?: string
            storyTextKo?: string
            contentSummary?: string
            contentSummaryKo?: string
            tags?: string[]
        }>

        return parsed
            .map((p): StoryTranslation | null => {
                const original = storyInputs[p.idx]
                if (!original) return null
                return {
                    id: original.id,
                    titleKo: p.titleKo ?? original.title,
                    ...(p.storyTextKo && { storyTextKo: p.storyTextKo }),
                    ...(p.contentSummary && { contentSummary: p.contentSummary }),
                    ...(p.contentSummaryKo && { contentSummaryKo: p.contentSummaryKo }),
                    tags: Array.isArray(p.tags) ? p.tags.slice(0, 3) : [],
                }
            })
            .filter((t): t is StoryTranslation => t !== null)
    } catch {
        console.error('[Translator] JSON parse failed')
        return []
    }
}

export const createHnTranslator = (deps: TranslatorDeps) => {
    const translateBatchWithRetry = async (
        storyInputs: StoryInput[],
        existingTags: string[],
        retryCount = 0,
    ): Promise<StoryTranslation[]> => {
        const storiesData = storyInputs.map((s, idx) => ({
            idx,
            id: s.id,
            title: s.title,
            storyText: s.storyText?.slice(0, 5000) ?? null,
            content: s.content?.slice(0, 12000) ?? null,
        }))

        const prompt = `Process the following ${storyInputs.length} Hacker News stories. For each story:
1. Translate the title to Korean
2. If storyText exists, translate it to Korean
3. If content exists, create a 2-3 sentence English summary, then translate to Korean
4. Select up to 3 relevant tags from: ${existingTags.slice(0, 30).join(', ')}

Stories:
${JSON.stringify(storiesData, null, 2)}

Respond with a JSON array in this exact format:
[
  {
    "idx": 0,
    "titleKo": "한국어 제목",
    "storyTextKo": "한국어 본문 (있는 경우)",
    "contentSummary": "English summary (if content exists)",
    "contentSummaryKo": "한국어 요약 (if content exists)",
    "tags": ["tag1", "tag2"]
  }
]

IMPORTANT: Return ONLY valid JSON array, no other text. Make sure JSON is complete and valid.`

        try {
            console.log(`[Translator] Sending batch of ${storyInputs.length} stories to Gemini...`)
            const text = await deps.ai.summarize(prompt, 16384)
            const results = safeJsonParse(text, storyInputs)
            console.log(`[Translator] Parsed ${results.length} translations`)
            return results
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            const isOverloaded =
                errorMessage.includes('503') || errorMessage.includes('overloaded') || errorMessage.includes('UNAVAILABLE')

            if (isOverloaded && retryCount < MAX_RETRIES) {
                const waitTime = RETRY_DELAY * (retryCount + 1)
                console.log(`[Translator] Model overloaded, retry ${retryCount + 1}/${MAX_RETRIES} after ${waitTime}ms...`)
                await delay(waitTime)
                return translateBatchWithRetry(storyInputs, existingTags, retryCount + 1)
            }

            console.error('[Translator] Batch translation failed:', errorMessage)
            return storyInputs.map((s) => ({
                id: s.id,
                titleKo: s.title,
                tags: [],
            }))
        }
    }

    const translateBatch = async (storyInputs: StoryInput[], existingTags: string[]): Promise<StoryTranslation[]> => {
        if (storyInputs.length === 0) return []

        console.log(`[Translator] Starting translation of ${storyInputs.length} stories in batches of ${BATCH_SIZE}`)
        const totalBatches = Math.ceil(storyInputs.length / BATCH_SIZE)
        const results: StoryTranslation[] = []

        for (let i = 0; i < storyInputs.length; i += BATCH_SIZE) {
            const batchNum = Math.floor(i / BATCH_SIZE) + 1
            const batch = storyInputs.slice(i, i + BATCH_SIZE)

            console.log(`[Translator] Batch ${batchNum}/${totalBatches} - stories: ${batch.map((s) => s.id).join(', ')}`)

            const batchResults = await translateBatchWithRetry(batch, existingTags)
            results.push(...batchResults)

            if (i + BATCH_SIZE < storyInputs.length) {
                await delay(BATCH_DELAY)
            }
        }

        console.log(`[Translator] All batches complete. Total translated: ${results.length}`)
        return results
    }

    const getExistingTags = async () => {
        const dbTags = await deps.db.getExistingTags()
        return [...new Set([...dbTags, ...DEFAULT_TAGS])]
    }

    const updateTagUsage = async (tags: string[]) => {
        await deps.db.updateTagUsage(tags)
    }

    return { translateBatch, getExistingTags, updateTagUsage }
}
