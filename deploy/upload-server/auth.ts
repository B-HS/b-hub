type AuthResult = {
    userId: string
    name: string
    email: string
}

type AuthDeps = {
    hubBaseUrl: string
}

export const createAuthClient = (deps: AuthDeps) => ({
    verifySession: async (cookie: string): Promise<AuthResult | null> => {
        try {
            const res = await fetch(`${deps.hubBaseUrl}/api/auth/get-session`, {
                headers: { Cookie: cookie },
            })
            if (!res.ok) return null

            const data = (await res.json()) as { user?: { id: string; name: string; email: string } }
            if (!data.user) return null

            return { userId: data.user.id, name: data.user.name, email: data.user.email }
        } catch {
            return null
        }
    },
})

export type AuthClient = ReturnType<typeof createAuthClient>
