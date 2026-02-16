import { z } from 'zod'
import { resolver } from 'hono-openapi/zod'
import type { ErrorCode } from '../lib/error-code'
import { ERROR_MESSAGE } from '../lib/error-message'
import { getStatusCode } from '../lib/error'

export const errorResponseDto = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
    }),
})

export const errorResponses = (codes: ErrorCode[]) => {
    const grouped = new Map<number, ErrorCode[]>()

    for (const code of codes) {
        const status = getStatusCode(code)
        const existing = grouped.get(status) ?? []
        existing.push(code)
        grouped.set(status, existing)
    }

    return Object.fromEntries(
        Array.from(grouped.entries()).map(([status, groupedCodes]) => [
            status,
            {
                description: groupedCodes.map((c) => ERROR_MESSAGE[c]).join(' / '),
                content: {
                    'application/json': {
                        schema: resolver(errorResponseDto),
                    },
                },
            },
        ]),
    )
}
