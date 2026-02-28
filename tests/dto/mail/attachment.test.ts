import { describe, expect, test } from 'bun:test'
import { mailAttachmentDownloadParamSchema } from '../../../dto/mail/attachment'

describe('mailAttachmentDownloadParamSchema', () => {
    test('유효한 messageId, attachmentId를 파싱한다', () => {
        const result = mailAttachmentDownloadParamSchema.parse({ messageId: 1, attachmentId: 2 })
        expect(result.messageId).toBe(1)
        expect(result.attachmentId).toBe(2)
    })

    test('문자열을 숫자로 변환한다', () => {
        const result = mailAttachmentDownloadParamSchema.parse({ messageId: '10', attachmentId: '20' })
        expect(result.messageId).toBe(10)
        expect(result.attachmentId).toBe(20)
    })

    test('0 이하 값을 거부한다', () => {
        expect(() => mailAttachmentDownloadParamSchema.parse({ messageId: 0, attachmentId: 1 })).toThrow()
        expect(() => mailAttachmentDownloadParamSchema.parse({ messageId: 1, attachmentId: -1 })).toThrow()
    })

    test('소수점 값을 거부한다', () => {
        expect(() => mailAttachmentDownloadParamSchema.parse({ messageId: 1.5, attachmentId: 1 })).toThrow()
        expect(() => mailAttachmentDownloadParamSchema.parse({ messageId: 1, attachmentId: 2.3 })).toThrow()
    })
})
