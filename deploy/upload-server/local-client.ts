// TODO: Mac Studio 구축 시 구현
// 10GB 초과 파일은 Mac Studio로 스트리밍-스트리밍 전송
// Mac Studio HTTP API에 createReadStream(filePath)을 body로 전달
export const createLocalClient = () => ({
    upload: async (_key: string, _filePath: string, _mimeType: string): Promise<{ success: false; error: string }> => {
        return { success: false, error: 'Mac Studio not implemented' }
    },
})

export type LocalClient = ReturnType<typeof createLocalClient>
