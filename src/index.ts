import type { API } from 'homebridge'
import { HttpTemperature } from './temperature-plugin'

export default (api: API) => {
  api.registerAccessory(
    'homebridge-http-temperature-2',
    'HttpTemperature2',
    HttpTemperature,
  )
}
