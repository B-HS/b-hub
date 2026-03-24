import { z } from 'zod'

export const createSubscriptionSchema = z.object({
    name: z.string().max(255).optional(),
})

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>
