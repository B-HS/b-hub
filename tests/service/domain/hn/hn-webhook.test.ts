import { describe, expect, test, mock } from 'bun:test'
import { createHnWebhookService } from '../../../../service/domain/hn/hn-webhook'

const createMockDb = () => ({
    getActiveWebhooks: mock(() =>
        Promise.resolve([
            {
                id: 1,
                provider: 'discord',
                url: 'https://discord.com/webhook',
                name: 'Test',
                digestTypes: ['daily'],
            },
        ]),
    ),
    getWebhookById: mock(() =>
        Promise.resolve({
            id: 1,
            provider: 'discord',
            url: 'https://discord.com/webhook',
            name: 'Test',
        }),
    ),
    registerWebhook: mock(() => Promise.resolve()),
    deactivateWebhook: mock(() => Promise.resolve()),
    deleteWebhook: mock(() => Promise.resolve()),
    listWebhooks: mock(() => Promise.resolve([{ id: 1, name: 'Test' }])),
    webhookExists: mock(() => Promise.resolve(false)),
    logWebhook: mock(() => Promise.resolve()),
    deleteWebhooksByUrl: mock(() => Promise.resolve(1)),
})

describe('createHnWebhookService', () => {
    test('register는 새 웹훅을 등록한다', async () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const result = await service.register('https://example.com/webhook')
        expect(result.success).toBe(true)
        expect(db.registerWebhook).toHaveBeenCalled()
    })

    test('register는 중복 URL을 거부한다', async () => {
        const db = createMockDb()
        db.webhookExists = mock(() => Promise.resolve(true))
        const service = createHnWebhookService({ db })

        const result = await service.register('https://example.com/webhook')
        expect(result.success).toBe(false)
    })

    test('remove는 웹훅을 삭제한다', async () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        await service.remove(1)
        expect(db.deleteWebhook).toHaveBeenCalledWith(1)
    })

    test('deactivate는 웹훅을 비활성화한다', async () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        await service.deactivate(1)
        expect(db.deactivateWebhook).toHaveBeenCalledWith(1)
    })

    test('list는 활성 웹훅 목록을 반환한다', async () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const result = await service.list()
        expect(result).toHaveLength(1)
    })

    test('test는 테스트 메시지를 전송한다', async () => {
        const db = createMockDb()
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: true,
                text: () => Promise.resolve('ok'),
            } as Response),
        )
        const service = createHnWebhookService({ db, fetchFn })

        const result = await service.test(1)
        expect(result.success).toBe(true)
    })

    test('test는 존재하지 않는 웹훅을 처리한다', async () => {
        const db = createMockDb()
        db.getWebhookById = mock(() => Promise.resolve(null))
        const service = createHnWebhookService({ db })

        const result = await service.test(999)
        expect(result.success).toBe(false)
    })

    test('sendDigestWebhook은 활성 웹훅에 전송한다', async () => {
        const db = createMockDb()
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: true,
                text: () => Promise.resolve('ok'),
            } as Response),
        )
        const service = createHnWebhookService({ db, fetchFn })

        const payload = service.createDigestPayload('daily', '2025-01-01', 'content', [])
        const result = await service.sendDigestWebhook(payload)
        expect(result.total).toBe(1)
        expect(result.success).toBe(1)
    })

    test('createDigestPayload는 올바른 payload를 생성한다', () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const payload = service.createDigestPayload('daily', '2025-01-01', 'content', [])
        expect(payload.type).toBe('daily')
        expect(payload.title).toContain('일간')
    })

    test('removeByUrl은 URL로 웹훅을 삭제한다', async () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const result = await service.removeByUrl('https://example.com')
        expect(result.deleted).toBe(1)
    })

    test('sendDigestWebhook에서 모든 webhook이 실패하면 실패 카운트를 반환한다', async () => {
        const db = createMockDb()
        db.getActiveWebhooks = mock(() =>
            Promise.resolve([
                { id: 1, provider: 'discord', url: 'https://fail1.com', name: 'Fail1', digestTypes: ['daily'] },
                { id: 2, provider: 'discord', url: 'https://fail2.com', name: 'Fail2', digestTypes: ['daily'] },
            ]),
        )
        const fetchFn = mock(() =>
            Promise.resolve({
                ok: false,
                text: () => Promise.resolve('error'),
            } as Response),
        )
        const service = createHnWebhookService({ db, fetchFn })

        const payload = service.createDigestPayload('daily', '2025-01-01', 'content', [])
        const result = await service.sendDigestWebhook(payload)
        expect(result.total).toBe(2)
        expect(result.success).toBe(0)
        expect(result.failed).toBe(2)
        expect(result.details).toHaveLength(2)
        expect(result.details.every((d) => d.status === 'failed')).toBe(true)
    })

    test('createDigestPayload에서 maxLength 이하 문자열은 content가 변경되지 않는다', () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const shortContent = 'Short content'
        const payload = service.createDigestPayload('daily', '2025-01-01', shortContent, [])
        expect(payload.content).toBe(shortContent)
    })

    test('createDigestPayload에서 weekly 타입은 주간 라벨을 사용한다', () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const payload = service.createDigestPayload('weekly', '2025-01-01', 'content', [])
        expect(payload.title).toContain('주간')
        expect(payload.type).toBe('weekly')
    })

    test('createDigestPayload에서 monthly 타입은 월간 라벨을 사용한다', () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const payload = service.createDigestPayload('monthly', '2025-01-01', 'content', [])
        expect(payload.title).toContain('월간')
        expect(payload.type).toBe('monthly')
    })

    test('createDigestPayload에서 weekly 타입은 주간 라벨을 사용한다', () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const payload = service.createDigestPayload('weekly', '2025-W01', 'weekly content', [])
        expect(payload.title).toContain('주간')
        expect(payload.type).toBe('weekly')
    })

    test('createDigestPayload에 스토리를 포함한다', () => {
        const db = createMockDb()
        const service = createHnWebhookService({ db })

        const stories = [
            { title: 'Story 1', titleKo: 'KO 1', url: 'https://example.com/1', score: 100 },
            { title: 'Story 2', titleKo: 'KO 2', url: 'https://example.com/2', score: 200 },
        ]
        const payload = service.createDigestPayload('daily', '2025-01-15', 'content', stories)
        expect(payload.stories).toHaveLength(2)
    })

    test('sendDigestWebhook은 활성 웹훅에 전송한다', async () => {
        const db = createMockDb()
        db.getActiveWebhooks = mock(() => Promise.resolve([{ id: 1, url: 'https://discord.webhook/1', isActive: true, createdAt: new Date() }]))
        const service = createHnWebhookService({ db })

        const payload = service.createDigestPayload('daily', '2025-01-15', 'content', [])
        await service.sendDigestWebhook(payload)
        expect(db.getActiveWebhooks).toHaveBeenCalled()
    })
})
