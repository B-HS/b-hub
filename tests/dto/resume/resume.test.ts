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

const localized = (value: string) => ({ ko: value, en: value, jp: value })

const validCvData = {
    profile: {
        firstName: 'Hyunseok',
        lastName: 'Byun',
        firstNameReading: { ko: '현석', en: '', jp: 'ヒョンソク' },
        lastNameReading: { ko: '변', en: '', jp: 'ビョン' },
        jobTitle: localized('Frontend Engineer'),
        birthday: localized('95. 07. 01'),
        location: { ko: '대한민국, 서울', en: 'Seoul, South Korea', jp: '韓国、ソウル' },
        email: 'test@test.com',
        github: 'https://github.com/test',
        blog: 'https://blog.test.com',
        introduce: [localized('소개 한 줄')],
    },
    seo: { title: localized('이력서'), description: localized('이력서 설명') },
    labels: {
        workExperience: localized('Work Experience'),
        projects: localized('Projects'),
        skills: localized('Skills'),
        etc: localized('etc.'),
    },
    workExperiences: [
        {
            name: localized('테스트 회사'),
            period: localized('24. 03 - 26. 09'),
            location: localized('서울'),
            role: localized('Frontend Engineer'),
            projects: [
                {
                    title: localized('테스트 프로젝트'),
                    description: [localized('설명 첫 줄'), localized('설명 둘째 줄')],
                    skills: ['Next.js', 'React'],
                    site: 'https://example.com',
                },
            ],
        },
    ],
    personalProjects: {
        name: localized('개인 프로젝트'),
        period: localized('22. 11 - 현재'),
        location: localized(''),
        role: localized('Toys'),
        projects: [{ title: localized('토이'), description: [localized('설명')], skills: ['Bun'] }],
    },
    skillGroups: [{ name: localized('Frontend'), items: ['Next.js', 'React'] }],
    additionalExperiences: [{ period: localized('25. 03'), description: localized('내용') }],
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
    test('유효한 웹 이력서 데이터를 파싱한다', () => {
        const result = cvDataSchema.safeParse(validCvData)
        expect(result.success).toBe(true)
    })

    test('필수 필드가 없으면 거부한다', () => {
        const result = cvDataSchema.safeParse({ profile: { firstName: 'Hyunseok' } })
        expect(result.success).toBe(false)
    })

    test('구 職務経歴書 구조를 거부한다', () => {
        const result = cvDataSchema.safeParse({ name: '猫 太郎', kana: 'ねこ たろう', summary: '요약', experience: {}, overview: [], jobs: [] })
        expect(result.success).toBe(false)
    })

    test('site 가 없는 프로젝트를 허용한다', () => {
        const { site: _site, ...projectWithoutSite } = validCvData.workExperiences[0].projects[0]
        const result = cvDataSchema.safeParse({
            ...validCvData,
            workExperiences: [{ ...validCvData.workExperiences[0], projects: [projectWithoutSite] }],
        })
        expect(result.success).toBe(true)
    })

    test('언어 키가 빠진 LocalizedText 를 거부한다', () => {
        const result = cvDataSchema.safeParse({
            ...validCvData,
            seo: { title: { ko: '이력서', en: 'Resume' }, description: localized('설명') },
        })
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
