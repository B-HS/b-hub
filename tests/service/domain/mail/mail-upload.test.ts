import { describe, expect, test, mock } from 'bun:test'
import { createMailUploadService } from '../../../../service/domain/mail/mail-upload'
import type { MailUpload } from '../../../../db/schema'

const createMockDeps = () => ({
    storage: {
        upload: mock((_key: string, _body: Buffer, _contentType: string) => Promise.resolve()),
        delete: mock(() => Promise.resolve()),
        getUrl: (key: string) => `https://cdn.example.com/${key}`,
        download: mock((_key: string): Promise<Buffer | null> => Promise.resolve(Buffer.from('file-data'))),
    },
    db: {
        insert: mock((_data: { userId: string; filename: string; mimeType: string; sizeBytes: number; r2Key: string; isInline: boolean }) => Promise.resolve({ id: 1 })),
        getById: mock((_id: number): Promise<MailUpload | null> => Promise.resolve({
            id: 1,
            userId: 'user-1',
            filename: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
            r2Key: 'mail/uploads/user-1/uuid-1/photo.jpg',
            isInline: false,
            createdAt: new Date(),
        })),
        getByIds: mock(() => Promise.resolve([
            {
                id: 1,
                userId: 'user-1',
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                r2Key: 'mail/uploads/user-1/uuid-1/photo.jpg',
                isInline: false,
                createdAt: new Date(),
            },
        ])),
        deleteById: mock(() => Promise.resolve()),
    },
    generateId: () => 'test-uuid',
})

describe('createMailUploadService', () => {
    describe('upload', () => {
        test('인라인 이미지를 업로드한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const jpegHeader = new Uint8Array(1024)
            jpegHeader.set([0xFF, 0xD8, 0xFF])
            const file = new File([jpegHeader], 'photo.jpg', { type: 'image/jpeg' })
            const result = await service.upload(file, 'user-1', true)

            expect(result.id).toBe(1)
            expect(result.isInline).toBe(true)
            expect(result.filename).toBe('photo.jpg')
            expect(result.url).toContain('mail/uploads/user-1/test-uuid/photo.jpg')
            expect(deps.storage.upload).toHaveBeenCalled()
            expect(deps.db.insert).toHaveBeenCalledWith(expect.objectContaining({
                userId: 'user-1',
                isInline: true,
            }))
        })

        test('첨부파일을 업로드한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'document.pdf', { type: 'application/pdf' })
            const result = await service.upload(file, 'user-1', false)

            expect(result.isInline).toBe(false)
            expect(result.mimeType).toBe('application/pdf')
        })

        test('인라인 이미지에서 허용되지 않는 MIME 타입을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'doc.pdf', { type: 'application/pdf' })
            await expect(service.upload(file, 'user-1', true)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
        })

        test('인라인 이미지 10MB 초과를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
            await expect(service.upload(file, 'user-1', true)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_TOO_LARGE' })
        })

        test('첨부파일 25MB 초과를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(26 * 1024 * 1024)], 'big.zip', { type: 'application/zip' })
            await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_TOO_LARGE' })
        })

        test('첨부파일에서 위험 MIME 타입을 블랙리스트 처리한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'malware.exe', { type: 'application/x-msdownload' })
            await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
        })

        test('R2 키 패턴이 올바르다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'test.jpg', { type: 'image/jpeg' })
            await service.upload(file, 'user-1', false)

            const uploadCall = deps.storage.upload.mock.calls[0]
            expect(uploadCall[0]).toBe('mail/uploads/user-1/test-uuid/test.jpg')
        })

        test('정확히 10MB인 인라인 이미지는 통과한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const pngData = new Uint8Array(10 * 1024 * 1024)
            pngData.set([0x89, 0x50, 0x4E, 0x47])
            const file = new File([pngData], 'exact.png', { type: 'image/png' })
            const result = await service.upload(file, 'user-1', true)
            expect(result.id).toBe(1)
        })

        test('정확히 25MB인 첨부파일은 통과한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(25 * 1024 * 1024)], 'exact.zip', { type: 'application/zip' })
            const result = await service.upload(file, 'user-1', false)
            expect(result.id).toBe(1)
        })

        test('첨부파일 모드에서 이미지 MIME도 허용된다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'photo.png', { type: 'image/png' })
            const result = await service.upload(file, 'user-1', false)
            expect(result.mimeType).toBe('image/png')
        })

        test('CRLF 포함 mimeType을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'test.jpg', { type: 'image/jpeg\r\nBcc: evil@hack.com' })
            await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
        })

        test('정규식 벗어나는 mimeType을 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'test.jpg', { type: 'image/jpeg; charset=utf-8' })
            await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
        })

        test('magic byte 불일치 인라인 이미지를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const htmlContent = new TextEncoder().encode('<html><body>evil</body></html>')
            const file = new File([htmlContent], 'fake.jpg', { type: 'image/jpeg' })
            await expect(service.upload(file, 'user-1', true)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
        })

        test('text/html 첨부를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'page.html', { type: 'text/html' })
            await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
        })

        test('buffer.length 기반으로 sizeBytes를 저장한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const content = new Uint8Array(2048)
            const file = new File([content], 'test.jpg', { type: 'image/jpeg' })
            await service.upload(file, 'user-1', false)

            const insertCall = deps.db.insert.mock.calls[0][0]
            expect(insertCall.sizeBytes).toBe(2048)
        })

        test('블랙리스트 MIME 타입을 모두 차단한다', async () => {
            const blocked = [
                'application/x-msdownload',
                'application/x-executable',
                'application/x-msdos-program',
                'application/x-sh',
                'application/x-bat',
                'application/x-csh',
                'text/html',
                'application/javascript',
                'application/x-msi',
                'application/hta',
                'application/x-ms-shortcut',
            ]
            for (const mime of blocked) {
                const deps = createMockDeps()
                const service = createMailUploadService(deps)
                const file = new File([new ArrayBuffer(1024)], 'bad', { type: mime })
                await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_INVALID_TYPE' })
            }
        })

        test('path traversal 파일명이 sanitize된다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], '../../etc/passwd', { type: 'image/jpeg' })
            await service.upload(file, 'user-1', false)

            const uploadCall = deps.storage.upload.mock.calls[0]
            expect(uploadCall[0]).not.toContain('..')
            expect(uploadCall[0]).toBe('mail/uploads/user-1/test-uuid/passwd')
        })

        test('위험 확장자 첨부파일을 차단한다', async () => {
            const blocked = ['.exe', '.bat', '.cmd', '.scr', '.msi', '.pif', '.vbs', '.js', '.ps1', '.sh', '.com']
            for (const ext of blocked) {
                const deps = createMockDeps()
                const service = createMailUploadService(deps)
                const file = new File([new ArrayBuffer(1024)], `malware${ext}`, { type: 'application/octet-stream' })
                await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_BLOCKED_EXTENSION' })
            }
        })

        test('안전한 확장자는 허용한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)
            const file = new File([new ArrayBuffer(1024)], 'document.pdf', { type: 'application/pdf' })
            const result = await service.upload(file, 'user-1', false)
            expect(result.id).toBe(1)
        })

        test('확장자 대소문자를 무시한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)
            const file = new File([new ArrayBuffer(1024)], 'malware.EXE', { type: 'application/octet-stream' })
            await expect(service.upload(file, 'user-1', false)).rejects.toMatchObject({ code: 'MAIL_UPLOAD_BLOCKED_EXTENSION' })
        })

        test('storage.upload 실패 시 에러가 전파된다', async () => {
            const deps = createMockDeps()
            deps.storage.upload = mock(() => Promise.reject(new Error('R2 upload failed')))
            const service = createMailUploadService(deps)

            const file = new File([new ArrayBuffer(1024)], 'test.jpg', { type: 'image/jpeg' })
            await expect(service.upload(file, 'user-1', false)).rejects.toThrow('R2 upload failed')
        })
    })

    describe('deleteUpload', () => {
        test('소유자가 파일을 삭제한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            await service.deleteUpload(1, 'user-1')

            expect(deps.storage.delete).toHaveBeenCalledWith('mail/uploads/user-1/uuid-1/photo.jpg')
            expect(deps.db.deleteById).toHaveBeenCalledWith(1)
        })

        test('다른 사용자의 파일 삭제를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            await expect(service.deleteUpload(1, 'user-2')).rejects.toMatchObject({ code: 'MAIL_UPLOAD_NOT_FOUND' })
        })

        test('존재하지 않는 파일 삭제를 거부한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock((_id: number): Promise<MailUpload | null> => Promise.resolve(null))
            const service = createMailUploadService(deps)

            await expect(service.deleteUpload(999, 'user-1')).rejects.toMatchObject({ code: 'MAIL_UPLOAD_NOT_FOUND' })
        })

        test('R2 삭제 실패 시 DB 삭제가 호출되지 않는다', async () => {
            const deps = createMockDeps()
            deps.storage.delete = mock(() => Promise.reject(new Error('R2 delete failed')))
            const service = createMailUploadService(deps)

            await expect(service.deleteUpload(1, 'user-1')).rejects.toThrow('R2 delete failed')
            expect(deps.db.deleteById).not.toHaveBeenCalled()
        })
    })

    describe('resolveForSend', () => {
        test('업로드 ID 목록을 ComposeAttachment 배열로 변환한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const result = await service.resolveForSend([1], 'user-1')

            expect(result).toHaveLength(1)
            expect(result[0].filename).toBe('photo.jpg')
            expect(result[0].mimeType).toBe('image/jpeg')
            expect(result[0].content).toBeInstanceOf(Buffer)
        })

        test('ID 수와 결과 수가 다르면 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getByIds = mock(() => Promise.resolve([]))
            const service = createMailUploadService(deps)

            await expect(service.resolveForSend([1, 2], 'user-1')).rejects.toMatchObject({ code: 'MAIL_UPLOAD_NOT_FOUND' })
        })

        test('다른 사용자의 파일 참조를 거부한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            await expect(service.resolveForSend([1], 'user-2')).rejects.toMatchObject({ code: 'MAIL_UPLOAD_NOT_FOUND' })
        })

        test('R2에서 다운로드 실패 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.storage.download = mock((_key: string): Promise<Buffer | null> => Promise.resolve(null))
            const service = createMailUploadService(deps)

            await expect(service.resolveForSend([1], 'user-1')).rejects.toMatchObject({ code: 'MAIL_UPLOAD_NOT_FOUND' })
        })

        test('중복 attachmentIds를 정상 처리한다', async () => {
            const deps = createMockDeps()
            const service = createMailUploadService(deps)

            const result = await service.resolveForSend([1, 1], 'user-1')
            expect(result).toHaveLength(1)
            expect(deps.db.getByIds).toHaveBeenCalledWith([1])
        })

        test('빈 배열은 빈 결과를 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getByIds = mock(() => Promise.resolve([]))
            const service = createMailUploadService(deps)

            const result = await service.resolveForSend([], 'user-1')
            expect(result).toHaveLength(0)
        })

        test('여러 파일을 동시에 resolve한다', async () => {
            const deps = createMockDeps()
            deps.db.getByIds = mock(() => Promise.resolve([
                { id: 1, userId: 'user-1', filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 100, r2Key: 'mail/uploads/user-1/u1/a.jpg', isInline: false, createdAt: new Date() },
                { id: 2, userId: 'user-1', filename: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 200, r2Key: 'mail/uploads/user-1/u2/b.pdf', isInline: false, createdAt: new Date() },
            ]))
            const service = createMailUploadService(deps)

            const result = await service.resolveForSend([1, 2], 'user-1')
            expect(result).toHaveLength(2)
            expect(result[0].filename).toBe('a.jpg')
            expect(result[1].filename).toBe('b.pdf')
            expect(deps.storage.download).toHaveBeenCalledTimes(2)
        })
    })
})
