import AbortController from 'abort-controller'
import type { AccessoryConfig } from 'homebridge'
import fetch, { Headers, Request, Response } from 'node-fetch'
import jq from 'node-jq'
import {
  HttpTemperatureConfigSchema,
  type HttpTemperatureConfig,
} from './config'

export class TemperatureService {
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

  static withAccessoryConfig(
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
