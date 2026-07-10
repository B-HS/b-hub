export type AiImagePart = {
    mimeType: string
    dataBase64: string
}

export type AiChatMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string
    images?: AiImagePart[]
}

export type AiCompletionRequest = {
    modelId: string
    system?: string
    messages: AiChatMessage[]
    maxTokens?: number
    temperature?: number
}

export type AiCompletionResult = {
    content: string
    modelId: string
    inputTokens: number | null
    outputTokens: number | null
}

export type AiStreamEvent = { type: 'delta'; text: string } | { type: 'done'; result: AiCompletionResult }

export type AiModelInfo = {
    modelId: string
    displayName: string | null
    metadata: Record<string, unknown> | null
}

export type AiProviderClient = {
    listModels(): Promise<AiModelInfo[]>
    complete(request: AiCompletionRequest): Promise<AiCompletionResult>
    completeStream(request: AiCompletionRequest): Promise<AsyncIterable<AiStreamEvent>>
    verify(): Promise<{ ok: boolean; error?: string }>
}

export const providerErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message: unknown }).message
        if (typeof message === 'string') return message
    }
    return 'unknown'
}
