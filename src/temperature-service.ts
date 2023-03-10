import AbortController from 'abort-controller'
import fetch, { Headers, Request, Response } from 'node-fetch'
import { run as jq } from 'node-jq'
import {
  HttpTemperatureConfigSchema,
  type HttpTemperatureConfig,
} from './config'

const isNumeric = (val: unknown): val is number =>
  typeof val === 'number' && !Number.isNaN(val)

export class TemperatureService {
  private __currentTemperature: number | null = null

  private constructor(
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

  static withAccessoryConfig(
    config: HttpTemperatureConfig,
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
      if (err.name === 'AbortError') {
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

    return new Request(this.config.url, {
      method: this.config.http_method,
      signal: abortController.signal,
      headers,
    })
  }

  private async parseTemperatureFromResponse(response: Response) {
    const body = await response.text()
    let temperature: number

    if (this.config.field_name) {
      const result = (await jq(`.${this.config.field_name} | tonumber`, body, {
        input: 'string',
        output: 'string',
      })) as string
      temperature = parseFloat(result)
    } else {
      temperature = parseFloat(body)
    }

    if (!isNumeric(temperature)) {
      throw new Error(`Non-numeric response received:\n${body}`)
    }

    return temperature
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
