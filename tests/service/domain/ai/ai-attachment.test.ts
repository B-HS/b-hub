import { describe, expect, test, mock } from 'bun:test'
import { createAiAttachmentService } from '../../../../service/domain/ai/ai-attachment'
import type { AiAttachmentInsert } from '../../../../service/domain/ai/ai-attachment'
import type { AiAttachment } from '../../../../db/schema'

const buildAttachment = (over: Partial<AiAttachment> = {}): AiAttachment => ({
    id: 1,
    userId: 'user-1',
    messageId: null,
    filename: 'photo.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    r2Key: 'ai/attachments/user-1/uuid-1/photo.png',
    createdAt: new Date(),
    ...over,
})

const pngFile = (name = 'photo.png', type = 'image/png', size = 1024) => {
    const bytes = new Uint8Array(size)
    bytes.set([0x89, 0x50, 0x4e, 0x47])
    return new File([bytes], name, { type })
}

const createDeps = () => ({
    storage: {
        upload: mock((_key: string, _body: Buffer, _contentType: string) => Promise.resolve()),
        delete: mock((_key: string) => Promise.resolve()),
        getUrl: (key: string) => `https://cdn.example.com/${key}`,
        download: mock((_key: string): Promise<Buffer | null> => Promise.resolve(Buffer.from('imgdata'))),
    },
    db: {
        insert: mock(async (_data: AiAttachmentInsert) => ({ id: 1 })),
        getById: mock(async (id: number) => buildAttachment({ id })),
        getByIds: mock(async (ids: number[]) => ids.map((id) => buildAttachment({ id }))),
        getTotalSizeByUser: mock(async (_userId: string) => 0),
        attachToMessage: mock(async (_ids: number[], _messageId: number) => {}),
        deleteById: mock(async (_id: number) => {}),
    },
    generateId: () => 'uuid-1',
    getUserQuotaBytes: mock(async (_userId: string) => 10 * 1024 * 1024),
})

describe('createAiAttachmentService', () => {
    describe('upload', () => {
        test('허용 이미지(PNG)를 업로드하고 storage.upload·db.insert 호출 후 url을 반환한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            const result = await service.upload(pngFile(), 'user-1')

            expect(deps.storage.upload).toHaveBeenCalled()
            expect(deps.storage.upload.mock.calls[0][0]).toBe('ai/attachments/user-1/uuid-1/photo.png')
            expect(deps.db.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-1',
                    filename: 'photo.png',
                    mimeType: 'image/png',
                    sizeBytes: 1024,
                    r2Key: 'ai/attachments/user-1/uuid-1/photo.png',
                }),
            )
            expect(result.id).toBe(1)
            expect(result.url).toBe('https://cdn.example.com/ai/attachments/user-1/uuid-1/photo.png')
            expect(result.filename).toBe('photo.png')
        })

        test('허용되지 않는 MIME(text/plain)은 AI_ATTACHMENT_INVALID_TYPE을 throw한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            const file = new File([new Uint8Array(10)], 'note.txt', { type: 'text/plain' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'AI_ATTACHMENT_INVALID_TYPE' })
            expect(deps.storage.upload).not.toHaveBeenCalled()
        })

        test('20MB 초과는 AI_ATTACHMENT_TOO_LARGE를 throw한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            const file = new File([new ArrayBuffer(21 * 1024 * 1024)], 'big.png', { type: 'image/png' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'AI_ATTACHMENT_TOO_LARGE' })
        })

        test('magic byte 불일치는 AI_ATTACHMENT_INVALID_TYPE을 throw한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            const bytes = new Uint8Array(1024)
            bytes.set([0x00, 0x01, 0x02, 0x03])
            const file = new File([bytes], 'fake.png', { type: 'image/png' })
            await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'AI_ATTACHMENT_INVALID_TYPE' })
            expect(deps.storage.upload).not.toHaveBeenCalled()
        })
    })

    describe('resolveImages', () => {
        test('빈 배열이면 []를 반환한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            const result = await service.resolveImages('user-1', [])
            expect(result).toEqual([])
            expect(deps.storage.download).not.toHaveBeenCalled()
        })

        test('download 결과를 base64 AiImagePart로 변환한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            const result = await service.resolveImages('user-1', [1])
            expect(result).toEqual([{ mimeType: 'image/png', dataBase64: Buffer.from('imgdata').toString('base64') }])
        })

        test('타 유저 첨부는 AI_ATTACHMENT_NOT_FOUND를 throw한다', async () => {
            const deps = createDeps()
            deps.db.getByIds = mock(async (ids: number[]) => ids.map((id) => buildAttachment({ id, userId: 'other' })))
            const service = createAiAttachmentService(deps)

            await expect(service.resolveImages('user-1', [1])).rejects.toMatchObject({ code: 'AI_ATTACHMENT_NOT_FOUND' })
        })

        test('download가 null이면 AI_ATTACHMENT_NOT_FOUND를 throw한다', async () => {
            const deps = createDeps()
            deps.storage.download = mock((_key: string): Promise<Buffer | null> => Promise.resolve(null))
            const service = createAiAttachmentService(deps)

            await expect(service.resolveImages('user-1', [1])).rejects.toMatchObject({ code: 'AI_ATTACHMENT_NOT_FOUND' })
        })
    })

    describe('attachToMessage', () => {
        test('소유 검증 후 중복 제거된 id로 db.attachToMessage를 호출한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            await service.attachToMessage('user-1', [1, 1], 55)
            expect(deps.db.attachToMessage).toHaveBeenCalledWith([1], 55)
        })

        test('빈 배열이면 db를 호출하지 않고 리턴한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            await service.attachToMessage('user-1', [], 55)
            expect(deps.db.getByIds).not.toHaveBeenCalled()
            expect(deps.db.attachToMessage).not.toHaveBeenCalled()
        })
    })

    describe('remove', () => {
        test('소유자가 삭제하면 storage.delete·db.deleteById를 호출한다', async () => {
            const deps = createDeps()
            const service = createAiAttachmentService(deps)

            await service.remove('user-1', 1)
            expect(deps.storage.delete).toHaveBeenCalledWith('ai/attachments/user-1/uuid-1/photo.png')
            expect(deps.db.deleteById).toHaveBeenCalledWith(1)
        })

        test('타 유저 첨부 삭제는 AI_ATTACHMENT_NOT_FOUND를 throw한다', async () => {
            const deps = createDeps()
            deps.db.getById = mock(async (id: number) => buildAttachment({ id, userId: 'other' }))
            const service = createAiAttachmentService(deps)

            await expect(service.remove('user-1', 1)).rejects.toMatchObject({ code: 'AI_ATTACHMENT_NOT_FOUND' })
            expect(deps.storage.delete).not.toHaveBeenCalled()
        })
    })

    describe('quota', () => {
        test('사용자 쿼터를 초과하면 AI_ATTACHMENT_TOO_LARGE를 던지고 업로드하지 않는다', async () => {
            const deps = createDeps()
            deps.getUserQuotaBytes = mock(async (_userId: string) => 1024)
            deps.db.getTotalSizeByUser = mock(async (_userId: string) => 1024)
            const service = createAiAttachmentService(deps)

            await expect(service.upload(pngFile('a.png', 'image/png', 512), 'user-1')).rejects.toMatchObject({ code: 'AI_ATTACHMENT_TOO_LARGE' })
            expect(deps.storage.upload).not.toHaveBeenCalled()
            expect(deps.db.insert).not.toHaveBeenCalled()
        })

        test('누적 사용량이 쿼터 이내면 업로드한다', async () => {
            const deps = createDeps()
            deps.getUserQuotaBytes = mock(async (_userId: string) => 10 * 1024 * 1024)
            deps.db.getTotalSizeByUser = mock(async (_userId: string) => 1024)
            const service = createAiAttachmentService(deps)

            const result = await service.upload(pngFile('a.png', 'image/png', 512), 'user-1')
            expect(result.id).toBe(1)
            expect(deps.storage.upload).toHaveBeenCalled()
        })
    })
})
