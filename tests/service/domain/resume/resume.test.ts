import { describe, expect, test, mock } from 'bun:test'
import { createResumeService } from '../../../../service/domain/resume/resume'

const mockResume = {
    id: 1,
    userId: 'user-1',
    type: 'resume',
    title: '내 이력서',
    data: { name: '猫 太郎' },
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createMockDb = () => ({
    getResumesByUserId: mock(() => Promise.resolve({ resumes: [mockResume], total: 1 })),
    getResumeById: mock((id: number) => Promise.resolve(id === 1 ? mockResume : null)),
    insertResume: mock(() => Promise.resolve({ id: 2 })),
    updateResume: mock(() => Promise.resolve()),
    deleteResume: mock(() => Promise.resolve()),
})

describe('createResumeService', () => {
    test('list는 사용자 이력서 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.list('user-1', { page: 1, limit: 20 })
        expect(result.resumes).toHaveLength(1)
        expect(result.total).toBe(1)
    })

    test('getById는 자신의 이력서를 반환한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.getById(1, 'user-1')
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.resume.id).toBe(1)
        }
    })

    test('getById는 존재하지 않는 경우 not_found를 반환한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.getById(999, 'user-1')
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.reason).toBe('not_found')
        }
    })

    test('getById는 타인 이력서에 not_owner를 반환한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.getById(1, 'other-user')
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.reason).toBe('not_owner')
        }
    })

    test('create는 이력서를 생성한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.create('user-1', {
            type: 'resume',
            title: '새 이력서',
            data: { name: '猫' } as never,
            isPublic: false,
        })
        expect(result.id).toBe(2)
    })

    test('update는 자신의 이력서를 수정한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.update(1, 'user-1', { title: '수정된 제목' })
        expect(result.success).toBe(true)
        expect(db.updateResume).toHaveBeenCalledWith(1, { title: '수정된 제목' })
    })

    test('update는 타인 이력서에 not_owner를 반환한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.update(1, 'other-user', { title: '해킹' })
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.reason).toBe('not_owner')
        }
    })

    test('delete는 자신의 이력서를 삭제한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.delete(1, 'user-1')
        expect(result.success).toBe(true)
        expect(db.deleteResume).toHaveBeenCalledWith(1)
    })

    test('delete는 타인 이력서에 not_owner를 반환한다', async () => {
        const db = createMockDb()
        const service = createResumeService({ db })

        const result = await service.delete(1, 'other-user')
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.reason).toBe('not_owner')
        }
    })
})
