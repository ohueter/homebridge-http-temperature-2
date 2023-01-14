import type { API } from 'homebridge'
import { ACCESSORY_NAME } from './config'
import { HttpTemperature } from './temperature-plugin'

export default (api: API) => {
  api.registerAccessory(
    'homebridge-http-temperature-2',
    ACCESSORY_NAME,
    HttpTemperature,
  )
}
