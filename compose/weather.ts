import { createKmaApiService } from '../service/domain/weather/kma-api'
import { createMockKmaApiService } from '../service/domain/weather/mock-kma-api'
import { createLocationService } from '../service/domain/weather/location'
import { createWeatherApiKeyService } from '../service/domain/weather/weather-api-key'
import locations from '../masterdata/locations.json'
import type { ComposeWeatherArgs } from './types'

export const composeWeather = ({ db, env }: ComposeWeatherArgs) => {
    const kmaApi = createKmaApiService({ apiKey: env.KMA_API_KEY ?? '' })
    const mockKmaApi = createMockKmaApiService()
    const locationService = createLocationService({ locations })
    const weatherApiKeyService = createWeatherApiKeyService({ db })

    return {
        kmaApi,
        mockKmaApi,
        locationService,
        weatherApiKeyService,
    }
}
