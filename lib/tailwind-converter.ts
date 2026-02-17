import { twi } from 'tw-to-css'

const parseCSSString = (cssString: string): Record<string, string | number> => {
    const result: Record<string, string | number> = {}
    const declarations = cssString.split(';').filter(Boolean)

    for (const declaration of declarations) {
        const colonIndex = declaration.indexOf(':')
        if (colonIndex === -1) continue

        const property = declaration.slice(0, colonIndex).trim()
        const value = declaration.slice(colonIndex + 1).trim()

        if (property && value) {
            const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
            result[camelCaseProperty] = value
        }
    }

    return result
}

export const convertTailwindToCSS = (tailwindClasses: string): Record<string, string | number> => {
    if (!tailwindClasses || tailwindClasses.trim() === '') return {}

    try {
        const cssString = twi(tailwindClasses)
        return parseCSSString(cssString)
    } catch {
        return {}
    }
}

export const mergeStyles = (...styles: Array<Record<string, string | number>>): Record<string, string | number> =>
    Object.assign({}, ...styles)
