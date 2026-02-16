import type { LocationData } from '../../../dto/weather/location'

const CELL_SIZE = 0.1

type SpatialGrid = Map<string, LocationData[]>

const buildSpatialIndex = (locations: LocationData[]): SpatialGrid => {
    const grid: SpatialGrid = new Map()
    for (const loc of locations) {
        const key = `${Math.floor(loc.latitude / CELL_SIZE)}:${Math.floor(loc.longitude / CELL_SIZE)}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key)!.push(loc)
    }
    return grid
}

type LocationServiceDeps = {
    locations: LocationData[]
}

export const createLocationService = (deps: LocationServiceDeps) => {
    const locations = deps.locations
    const spatialIndex = buildSpatialIndex(locations)

    const getAll = () => locations

    const search = (query: string) => {
        const q = query.toLowerCase()
        return locations.filter(
            (loc) => loc.level1.toLowerCase().includes(q) || loc.level2?.toLowerCase().includes(q) || loc.level3?.toLowerCase().includes(q),
        )
    }

    const getByGrid = (gridX: number, gridY: number) => locations.find((loc) => loc.gridX === gridX && loc.gridY === gridY) ?? null

    const findNearest = (lat: number, lon: number) => {
        const candidates: LocationData[] = []

        for (let dLat = -1; dLat <= 1; dLat++) {
            for (let dLon = -1; dLon <= 1; dLon++) {
                const key = `${Math.floor(lat / CELL_SIZE) + dLat}:${Math.floor(lon / CELL_SIZE) + dLon}`
                const cell = spatialIndex.get(key)
                if (cell) candidates.push(...cell)
            }
        }

        if (candidates.length === 0) return null

        let nearest: LocationData | null = null
        let minDistance = Infinity

        for (const loc of candidates) {
            const distance = Math.sqrt(Math.pow(loc.latitude - lat, 2) + Math.pow(loc.longitude - lon, 2))
            if (distance < minDistance) {
                minDistance = distance
                nearest = loc
            }
        }

        return nearest
    }

    return { getAll, search, getByGrid, findNearest }
}

export type LocationService = ReturnType<typeof createLocationService>
