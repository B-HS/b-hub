export const createLocalClient = () => ({
    upload: async (_key: string, _body: Buffer | ReadableStream, _mimeType: string): Promise<{ success: false; error: string }> => {
        return { success: false, error: 'Mac Studio not implemented' }
    },
})

export type LocalClient = ReturnType<typeof createLocalClient>
