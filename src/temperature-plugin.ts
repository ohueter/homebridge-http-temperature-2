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

const isNull = (value: unknown): value is null => {
  return value === null
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

    this.hapInformationService = new api.hap.Service.AccessoryInformation()
    this.hapTemperatureService = new api.hap.Service.TemperatureSensor()
    this.hapTemperatureService
      .getCharacteristic(api.hap.Characteristic.CurrentTemperature)
      .onGet(this.getTemperature.bind(this))

    try {
      this.temperatureService = TemperatureService.withAccessoryConfig(
        config as HttpTemperatureAccessoryConfig,
        (currentTemperature) => {
          this.hapTemperatureService.updateCharacteristic(
            api.hap.Characteristic.CurrentTemperature,
            currentTemperature,
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

      if (err instanceof ZodError) {
        err.issues.map((issue) => this.log(`${issue.path}: ${issue.message}`))
      }
    }
  }

  async getTemperature() {
    if (isNull(this.temperatureService)) {
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      )
    }

    return await this.temperatureService.getCurrentTemperature()
  }

  getServices() {
    return [this.hapInformationService, this.hapTemperatureService]
  }
}
