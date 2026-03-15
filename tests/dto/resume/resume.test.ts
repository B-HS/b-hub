import { describe, expect, test } from 'bun:test'
import { resumeCreateSchema, resumeUpdateSchema, resumeListQuerySchema } from '../../../dto/resume/resume'
import { resumeDataSchema, cvDataSchema } from '../../../dto/resume/resume-data'

const validResumeData = {
    name_furigana: 'ねこ　たろう',
    name: '猫　太郎',
    gender: '男' as const,
    birthday_year: '平成7',
    birthday_month: '10',
    birthday_day: '10',
    age: '30',
    photo: '',
    contact: { furigana: 'test', postal: '100-0001', address: '東京都', phone: '099-9999-9999', email: 'test@test.com' },
    emergency: { furigana: 'test', postal: '100-0002', address: '東京都', phone: '099-8888-8888', email: '' },
    history: [{ year: '平成26', month: '3', content: '卒業' }],
    qualifications: [{ year: '令和5', month: '1', content: '免許取得' }],
    self_promotion: 'テスト',
    commuting_hours: '1',
    commuting_minutes: '30',
    dependents: '0',
    marital_status: '無' as const,
    spouse_obligation: '無' as const,
    objective: '',
    creation_year: '令和8',
    creation_month: '3',
    creation_day: '11',
}

const validCvData = {
    name: '猫 太郎',
    kana: 'ねこ たろう',
    summary: 'Webフロントエンド開発経験を持つエンジニアです。',
    experience: { environments: 'Linux', languages: 'TypeScript', frameworks: 'React', infrastructure: 'AWS', tools: 'Git' },
    overview: [{ title: '株式会社テスト', period: '2023年～', content: '開発', tech_stack: 'React' }],
    jobs: [
        {
            title: 'Web開発',
            period_from: '23/10',
            period_to: '25/7',
            period_span: '1年10ヶ月',
            kind: 'Web',
            role: 'エンジニア',
            size: '6名',
            content: '開発',
            lang: 'TypeScript',
            tools: 'Git',
        },
    ],
}

describe('resumeDataSchema', () => {
    test('유효한 이력서 데이터를 파싱한다', () => {
        const result = resumeDataSchema.safeParse(validResumeData)
        expect(result.success).toBe(true)
    })

    test('필수 필드가 없으면 거부한다', () => {
        const result = resumeDataSchema.safeParse({ name: '猫' })
        expect(result.success).toBe(false)
    })

    test('유효하지 않은 gender를 거부한다', () => {
        const result = resumeDataSchema.safeParse({ ...validResumeData, gender: 'other' })
        expect(result.success).toBe(false)
    })
})

describe('cvDataSchema', () => {
    test('유효한 CV 데이터를 파싱한다', () => {
        const result = cvDataSchema.safeParse(validCvData)
        expect(result.success).toBe(true)
    })

    test('필수 필드가 없으면 거부한다', () => {
        const result = cvDataSchema.safeParse({ name: '猫' })
        expect(result.success).toBe(false)
    })
})

describe('resumeCreateSchema', () => {
    test('type=resume + resumeData 구조를 통과한다', () => {
        const result = resumeCreateSchema.safeParse({
            type: 'resume',
            title: '내 이력서',
            data: validResumeData,
        })
        expect(result.success).toBe(true)
    })

    test('type=cv + cvData 구조를 통과한다', () => {
        const result = resumeCreateSchema.safeParse({
            type: 'cv',
            title: '내 CV',
            data: validCvData,
        })
        expect(result.success).toBe(true)
    })

    test('type=resume인데 cv 구조 data면 거부한다', () => {
        const result = resumeCreateSchema.safeParse({
            type: 'resume',
            title: '테스트',
            data: validCvData,
        })
        expect(result.success).toBe(false)
    })

    test('type=cv인데 resume 구조 data면 거부한다', () => {
        const result = resumeCreateSchema.safeParse({
            type: 'cv',
            title: '테스트',
            data: validResumeData,
        })
        expect(result.success).toBe(false)
    })

    test('isPublic 기본값은 false이다', () => {
        const result = resumeCreateSchema.safeParse({
            type: 'resume',
            title: '테스트',
            data: validResumeData,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.isPublic).toBe(false)
        }
    })

    test('유효하지 않은 type을 거부한다', () => {
        const result = resumeCreateSchema.safeParse({
            type: 'portfolio',
            title: '테스트',
            data: validResumeData,
        })
        expect(result.success).toBe(false)
    })
})

describe('resumeUpdateSchema', () => {
    test('모든 필드가 optional이다', () => {
        const result = resumeUpdateSchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('title만 수정 가능하다', () => {
        const result = resumeUpdateSchema.safeParse({ title: '새 제목' })
        expect(result.success).toBe(true)
    })
})

describe('resumeListQuerySchema', () => {
    test('기본값으로 파싱한다', () => {
        const result = resumeListQuerySchema.safeParse({})
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.page).toBe(1)
            expect(result.data.limit).toBe(20)
        }
    })

    test('type 필터를 적용한다', () => {
        const result = resumeListQuerySchema.safeParse({ type: 'resume' })
        expect(result.success).toBe(true)
    })

    test('유효하지 않은 type을 거부한다', () => {
        const result = resumeListQuerySchema.safeParse({ type: 'portfolio' })
        expect(result.success).toBe(false)
    })
})
