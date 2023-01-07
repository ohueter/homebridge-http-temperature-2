import type {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicGetHandler,
  Logging,
  Service,
} from 'homebridge'
import fetch, { AbortError, Headers, Request, Response } from 'node-fetch'
import jq from 'node-jq'
import { z } from 'zod'

const isNull = (value: unknown): value is null => {
  return value === null
}

const HttpTemperatureConfigSchema = z
  .object({
    // Mandatory
    /** Endpoint URL (must start with http:// or https://). */
    url: z.string().url().min(1),

    /** Accessory name. */
    name: z.string().min(1),

    // Optional
    /** Object with user and pass fields used to authenticate the request using basic http auth. */
    auth: z
      .object({
        user: z.string().min(1),
        pass: z.string().min(1),
      })
      .optional(),

    /** Enable/disable debug logs (Default: false). */
    debug: z.boolean().default(false),

    /**
     * Field path that will be used from the JSON response of the endpoint.
     * Alternatively, if the field_name contains an empty string ("field_name": ""),
     * the expected response is directly the current temperature value (Default: temperature).
     */
    field_name: z.string().default('temperature'),

    /** Object with headers for http requests. See node-fetch Headers class for more information. */
    http_headers: z.record(z.string().min(1), z.string().min(1)).optional(),

    /** HTTP method used to get the temperature (Default: GET). */
    http_method: z.enum(['GET', 'POST']).default('GET'),

    /**
     * http/https protocol to use (Default: infered from url). Supported values are: "http" and "https".
     * @deprecated Protocol must be specified in url.
     */
    http_protocol: z.enum(['http', 'https']).optional(),

    /** Additional information for the accessory. */
    manufacturer: z.string().default('@metbosch'),

    /**
     * Min. temperature that can be returned by the endpoint (Default: -100).
     * @deprecated Only useful for thermostats.
     */
    min_temp: z.number().default(-100),

    /**
     * Max. temperature that can be returned by the endpoint (Default: 130).
     * @deprecated Only useful for thermostats.
     */
    max_temp: z.number().default(130),

    /** Additional information for the accessory. */
    model: z.string().default('Model not available'),

    /** Additional information for the accessory. */
    serial: z.string().default('Non-defined serial'),

    /** Waiting time for the endpoint response before fail (Default: 5000ms). */
    timeout: z.number().min(0).default(5000),

    /**
     * Temperature units of the value returned by the endpoint.
     * Supported values are: "C" for Celsius and "F" for Fahrenheit (Default: 'C').
     */
    units: z.enum(['C', 'F']).default('C'),

    /**
     * If not zero, the field defines the polling period in milliseconds for the sensor state (Default is 120000ms).
     * When the value is zero, the state is only updated when homebridge requests the current value.
     */
    update_interval: z.number().min(0).default(120000),
  })
  .strict()

type HttpTemperatureConfig = z.infer<typeof HttpTemperatureConfigSchema>

class TemperatureService {
  private __currentTemperature: number | null = null

  constructor(
    private config: HttpTemperatureConfig,
    callback: (currentTemperature: number | null) => void,
  ) {
    if (config.update_interval > 0) {
      setInterval(async () => {
        try {
          this.__currentTemperature = await this.getTemperature()
        } catch (err) {
          this.__currentTemperature = null
        } finally {
          callback(this.__currentTemperature)
        }
      }, config.update_interval)
    }
  }

  static fromAccessoryConfig(
    config: AccessoryConfig,
    callback: (currentTemperature: number | null) => void,
  ): TemperatureService {
    const result = HttpTemperatureConfigSchema.safeParse(config)

    if (result.success) {
      return new this(result.data, callback)
    } else {
      throw result.error
    }
  }

  async getCurrentTemperature() {
    if (!this.config.update_interval) {
      try {
        this.__currentTemperature = await this.getTemperature()
      } catch (err) {
        this.__currentTemperature = null
      }
    }
    return this.__currentTemperature
  }

  async getTemperature() {
    const abortController = new AbortController()
    const timeout = setTimeout(
      () => abortController.abort(),
      this.config.timeout,
    )

    try {
      const response = await fetch(
        this.getFetchTemperatureRequest(abortController),
      )
      return this.parseTemperatureFromResponse(response)
    } catch (err) {
      if (err instanceof AbortError) {
        return null
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  private getFetchTemperatureRequest(
    abortController: AbortController,
  ): Request {
    const headers = new Headers(this.config.http_headers)

    if (this.config.auth) {
      headers.set(
        'Authorization',
        `Basic ${Buffer.from(
          this.config.auth.user + ':' + this.config.auth.pass,
        ).toString('base64')}`,
      )
    }

    return new Request('http://', {
      method: 'GET',
      signal: abortController.signal,
      headers,
    })
  }

  private async parseTemperatureFromResponse(
    response: Response,
  ): Promise<number | null> {
    if (this.config.field_name) {
      const json = await response.json()
      const result = await jq.run(`.${this.config.field_name}`, json)
      if (typeof result === 'string') {
        return parseFloat(result)
      }
    } else {
      const text = await response.text()
      return parseFloat(text)
    }
    return null
  }

  getDeviceConfig() {
    return {
      name: this.config.name,
      manufacturer: this.config.manufacturer,
      model: this.config.model,
      serial: this.config.serial,
    }
  }
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
      this.temperatureService = TemperatureService.fromAccessoryConfig(
        config,
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

      if (err instanceof z.ZodError) {
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
