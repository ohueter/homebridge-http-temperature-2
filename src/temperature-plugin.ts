import type {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicGetHandler,
  Logging,
  Service,
} from 'homebridge'
import { ZodError } from 'zod'
import type { HttpTemperatureAccessoryConfig } from './config'
import { TemperatureService } from './temperature-service'

const isNil = (value: unknown): value is null | undefined => {
  return value == null
}

interface HttpTemperaturePugin {
  getTemperature: CharacteristicGetHandler
}

export class HttpTemperature implements AccessoryPlugin, HttpTemperaturePugin {
  private readonly log: Logging
  private readonly api: API

  private readonly hapTemperatureService: Service
  private readonly hapInformationService: Service

  private temperatureService: TemperatureService | null

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log
    this.api = api

    log('Startet HttpTemperature2 with config:', config)

    this.hapInformationService = new api.hap.Service.AccessoryInformation()
    this.hapTemperatureService = new api.hap.Service.TemperatureSensor()
    this.hapTemperatureService
      .getCharacteristic(api.hap.Characteristic.CurrentTemperature)
      .onGet(this.getTemperature.bind(this))

    try {
      this.temperatureService = TemperatureService.withAccessoryConfig(
        config as HttpTemperatureAccessoryConfig,
        (temperature) => {
          if (isNil(temperature)) {
            this.log(`Failed fetching current temperature`)
            throw new Error(`Failed fetching current temperature`)
          }

          this.log(`Fetched temperature: ${temperature}`)
          this.hapTemperatureService.updateCharacteristic(
            api.hap.Characteristic.CurrentTemperature,
            temperature,
          )
        },
      )

      const deviceConfig = this.temperatureService.getDeviceConfig()
      this.hapTemperatureService.displayName = deviceConfig.name
      this.hapInformationService
        .setCharacteristic(
          api.hap.Characteristic.Manufacturer,
          deviceConfig.manufacturer,
        )
        .setCharacteristic(api.hap.Characteristic.Model, deviceConfig.model)
        .setCharacteristic(
          api.hap.Characteristic.SerialNumber,
          deviceConfig.serial,
        )
    } catch (err) {
      this.temperatureService = null
      this.log.error('Failed to initialize TemperatureService')

      if (err instanceof ZodError) {
        err.issues.map((issue) => this.log(`${issue.path}: ${issue.message}`))
      }
    }
  }

  async getTemperature() {
    const temperature = await this.temperatureService?.getCurrentTemperature()

    if (isNil(temperature)) {
      this.log(`Failed getting current (cached) temperature`)
      throw new Error(`Failed getting current (cached) current temperature`)
    }

    this.log(`Current (cached) temperature: ${temperature}`)

    return temperature
  }

  getServices() {
    return [this.hapInformationService, this.hapTemperatureService]
  }
}
