type AiService = {
    summarize: (prompt: string) => Promise<string>
}

type DigestDb = {
    getUnsummarizedStories: (limit: number) => Promise<Record<string, unknown>[]>
    getCommentsByStoryId: (storyId: number) => Promise<Record<string, unknown>[]>
    saveSummary: (storyId: number, summary: string, tags: string[], summaryType: string) => Promise<void>
    markStorySummarized: (storyId: number) => Promise<void>
    getSummaryByStoryId: (storyId: number) => Promise<Record<string, unknown> | null>
    getRecentSummaries: (summaryType: string, limit: number) => Promise<Record<string, unknown>[]>
    getStoriesByIds: (ids: number[]) => Promise<Record<string, unknown>[]>
    upsertDigest: (data: { digestType: string; digestKey: string; title: string; content: string; storyIds: number[] }) => Promise<void>
    getStoriesForPeriod: (startTime: number, endTime: number, limit: number) => Promise<Record<string, unknown>[]>
    getSummariesByStoryIds: (ids: number[]) => Promise<Record<string, unknown>[]>
}

type HnDigestDeps = {
    ai: AiService
    db: DigestDb
    notification?: {
        sendWebhook: (url: string, body: Record<string, unknown>) => Promise<{ success: boolean; statusCode?: number }>
    }
}

export const createHnDigestService = (deps: HnDigestDeps) => {
    const summarizeStory = async (story: Record<string, unknown>, storyComments: Record<string, unknown>[]) => {
        const topComments = storyComments
            .filter((c) => (c.depth as number) === 0 && c.commentText)
            .slice(0, 10)
            .map((c) => c.commentText as string)
            .join('\n- ')

        const contentForSummary = (story.contentSummary as string) ?? (story.storyText as string) ?? ''
        const storyTags = (story.tags as string[]) ?? []

        const prompt = `# Role
너는 실리콘밸리의 시니어 소프트웨어 엔지니어이자 기술 전문 분석가이다.
제공된 Hacker News 데이터를 바탕으로 상세 기술 리포트를 작성하라.

# Information
- 제목: ${story.title}
- URL: ${story.url ?? 'None'}
- 본문 요약: ${contentForSummary || 'None'}
- 통계: ${story.score} points, ${story.descendants} comments
- 주요 댓글: ${topComments || 'None'}

# Output Format
Respond ONLY with a valid JSON object.
{"summary": "마크다운을 활용한 25줄 이내 상세 리포트"}`

        try {
            const text = await deps.ai.summarize(prompt)
            const jsonMatch = text.match(/\{[\s\S]*\}/)

            if (!jsonMatch) {
                return {
                    summary: (story.titleKo as string) ?? (story.title as string) ?? '',
                    tags: storyTags,
                }
            }

            const parsed = JSON.parse(jsonMatch[0]) as { summary: string }
            return { summary: parsed.summary ?? '', tags: storyTags }
        } catch {
            return {
                summary: (story.titleKo as string) ?? (story.title as string) ?? '',
                tags: storyTags,
            }
        }
    }

    const summarizeAndSave = async (story: Record<string, unknown>, storyComments: Record<string, unknown>[], summaryType = 'daily') => {
        const result = await summarizeStory(story, storyComments)
        await deps.db.saveSummary(story.id as number, result.summary, result.tags, summaryType)
        await deps.db.markStorySummarized(story.id as number)
        return result
    }

    const generateDigestSummary = async (
        digestType: 'daily' | 'weekly' | 'monthly',
        storySummaries: {
            title: string
            titleKo?: string
            summary: string
            score: number
            tags: string[]
        }[],
    ) => {
        const typeLabel = digestType === 'daily' ? '일간' : digestType === 'weekly' ? '주간' : '월간'

        const storiesText = storySummaries
            .map((s, i) => {
                const displayTitle = s.titleKo ?? s.title
                const tagsText = s.tags.length > 0 ? ` [${s.tags.join(', ')}]` : ''
                return `${i + 1}. [${s.score}점] ${displayTitle}${tagsText}\n   ${s.summary}`
            })
            .join('\n\n')

        const prompt = `다음은 Hacker News ${typeLabel} 다이제스트입니다.
주요 스토리들을 종합하여 ${typeLabel} 기술 트렌드를 2-3 문단으로 요약해주세요.

스토리 목록:
${storiesText}

한국어로 작성해주세요. 마크다운 형식으로 작성해도 됩니다.`

        try {
            return await deps.ai.summarize(prompt)
        } catch {
            return `${typeLabel} 다이제스트 생성에 실패했습니다.`
        }
    }

    const runDaily = async () => {
        const unsummarized = await deps.db.getUnsummarizedStories(30)

        for (const story of unsummarized) {
            const storyComments = await deps.db.getCommentsByStoryId(story.id as number)
            await summarizeAndSave(story, storyComments, 'daily')
        }

        const today = new Date()
        const dateKey = today.toISOString().split('T')[0]

        const recentSummaries = await deps.db.getRecentSummaries('daily', 20)
        const storyIds = recentSummaries.map((s) => s.storyId as number)
        const storyList = storyIds.length > 0 ? await deps.db.getStoriesByIds(storyIds) : []
        const storyMap = new Map(storyList.map((s) => [s.id as number, s]))

        const storySummaries = recentSummaries
            .map((s) => {
                const story = storyMap.get(s.storyId as number)
                return {
                    title: (story?.title as string) ?? '',
                    titleKo: (story?.titleKo as string) ?? undefined,
                    summary: s.summary as string,
                    url: (story?.url as string) ?? null,
                    score: (story?.score as number) ?? 0,
                    tags: (s.tags as string[]) ?? [],
                }
            })
            .filter((s) => s.title)

        const digestContent = await generateDigestSummary('daily', storySummaries)

        await deps.db.upsertDigest({
            digestType: 'daily',
            digestKey: dateKey,
            title: `일간 다이제스트 - ${dateKey}`,
            content: digestContent,
            storyIds,
        })

        return { summarized: unsummarized.length, date: dateKey }
    }

    const getWeekNumber = (date: Date): number => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
        const dayNum = d.getUTCDay() || 7
        d.setUTCDate(d.getUTCDate() + 4 - dayNum)
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    }

    const runWeekly = async () => {
        const now = new Date()
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - 7)

        const startTimestamp = Math.floor(weekStart.getTime() / 1000)
        const endTimestamp = Math.floor(now.getTime() / 1000)

        const weeklyStories = await deps.db.getStoriesForPeriod(startTimestamp, endTimestamp, 30)
        const storyIds = weeklyStories.map((s) => s.id as number)
        const summaryList = storyIds.length > 0 ? await deps.db.getSummariesByStoryIds(storyIds) : []
        const summaryMap = new Map(summaryList.map((s) => [s.storyId as number, s]))

        const storySummaries = weeklyStories
            .map((story) => {
                const summary = summaryMap.get(story.id as number)
                return {
                    title: (story.title as string) ?? '',
                    titleKo: (story.titleKo as string) ?? undefined,
                    summary: (summary?.summary as string) ?? '',
                    url: (story.url as string) ?? null,
                    score: (story.score as number) ?? 0,
                    tags: (summary?.tags as string[]) ?? [],
                }
            })
            .filter((s) => s.title && s.summary)

        const year = now.getFullYear()
        const weekNum = getWeekNumber(now)
        const weekKey = `${year}-W${String(weekNum).padStart(2, '0')}`

        const digestContent = await generateDigestSummary('weekly', storySummaries)

        await deps.db.upsertDigest({
            digestType: 'weekly',
            digestKey: weekKey,
            title: `주간 다이제스트 - ${weekKey}`,
            content: digestContent,
            storyIds,
        })

        return { stories: weeklyStories.length, week: weekKey }
    }

    const runMonthly = async () => {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

        const startTimestamp = Math.floor(monthStart.getTime() / 1000)
        const endTimestamp = Math.floor(now.getTime() / 1000)

        const monthlyStories = await deps.db.getStoriesForPeriod(startTimestamp, endTimestamp, 50)
        const storyIds = monthlyStories.map((s) => s.id as number)
        const summaryList = storyIds.length > 0 ? await deps.db.getSummariesByStoryIds(storyIds) : []
        const summaryMap = new Map(summaryList.map((s) => [s.storyId as number, s]))

        const storySummaries = monthlyStories
            .map((story) => {
                const summary = summaryMap.get(story.id as number)
                return {
                    title: (story.title as string) ?? '',
                    titleKo: (story.titleKo as string) ?? undefined,
                    summary: (summary?.summary as string) ?? '',
                    url: (story.url as string) ?? null,
                    score: (story.score as number) ?? 0,
                    tags: (summary?.tags as string[]) ?? [],
                }
            })
            .filter((s) => s.title && s.summary)

        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

        const digestContent = await generateDigestSummary('monthly', storySummaries)

        await deps.db.upsertDigest({
            digestType: 'monthly',
            digestKey: monthKey,
            title: `월간 다이제스트 - ${monthKey}`,
            content: digestContent,
            storyIds,
        })

        return { stories: monthlyStories.length, month: monthKey }
    }

    return { summarizeStory, summarizeAndSave, generateDigestSummary, runDaily, runWeekly, runMonthly }
}

export type HnDigestService = ReturnType<typeof createHnDigestService>
