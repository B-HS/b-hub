import { describe, expect, test, mock } from 'bun:test'
import { createAiService } from '../../../service/shared/ai'

const createMockModel = (text: string) => ({
    generateContent: mock(() => Promise.resolve({ response: { text: () => text } })),
})

describe('createAiService', () => {
    describe('summarize', () => {
        test('요약 결과를 반환한다', async () => {
            const model = createMockModel('요약된 텍스트입니다')
            const ai = createAiService({ model })

            const result = await ai.summarize('긴 콘텐츠...', '요약해주세요')
            expect(result.success).toBe(true)
            expect(result.text).toBe('요약된 텍스트입니다')
        })

        test('에러 시 실패를 반환한다', async () => {
            const model = {
                generateContent: mock(() => Promise.reject(new Error('API quota exceeded'))),
            }
            const ai = createAiService({ model })

            const result = await ai.summarize('콘텐츠', '요약')
            expect(result.success).toBe(false)
            expect(result.error).toBe('API quota exceeded')
        })
    })

    describe('translate', () => {
        test('번역 결과를 반환한다', async () => {
            const model = createMockModel('번역된 텍스트')
            const ai = createAiService({ model })

            const result = await ai.translate('Hello world')
            expect(result.success).toBe(true)
            expect(result.text).toBe('번역된 텍스트')
        })
    })

    describe('generateTags', () => {
        test('태그 배열을 반환한다', async () => {
            const model = createMockModel('["typescript", "react"]')
            const ai = createAiService({ model })

            const result = await ai.generateTags('TypeScript와 React 관련 글')
            expect(result).toEqual(['typescript', 'react'])
        })

        test('코드블록으로 감싸인 JSON을 처리한다', async () => {
            const model = createMockModel('```json\n["ai", "ml"]\n```')
            const ai = createAiService({ model })

            const result = await ai.generateTags('AI 관련 글')
            expect(result).toEqual(['ai', 'ml'])
        })

        test('파싱 실패 시 빈 배열을 반환한다', async () => {
            const model = createMockModel('not valid json')
            const ai = createAiService({ model })

            const result = await ai.generateTags('콘텐츠')
            expect(result).toEqual([])
        })

        test('API 에러 시 빈 배열을 반환한다', async () => {
            const model = {
                generateContent: mock(() => Promise.reject(new Error('fail'))),
            }
            const ai = createAiService({ model })

            const result = await ai.generateTags('콘텐츠')
            expect(result).toEqual([])
        })
    })
})
