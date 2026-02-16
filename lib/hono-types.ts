type AuthUser = {
    id: string
    name: string
    email: string
    role: string | null
    image: string | null
}

export type HonoVariables = {
    user: AuthUser
    errorCode: string
}

export type AuthContext = {
    Variables: HonoVariables
}
