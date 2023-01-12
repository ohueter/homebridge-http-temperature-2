import AbortController from 'abort-controller'
import express from 'express'
import http from 'http'
import type { AddressInfo } from 'net'
import { Response } from 'node-fetch'
import {
  HttpTemperatureConfigSchema,
  type HttpTemperatureConfig,
} from './config'
import { TemperatureService } from './temperature-service'

/**
 * When an async function is awaited in a callback to setInterval() or setTimeout(),
 * jest.advanceTimersToNextTimer() triggers the execution of the callback, but the
 * Promises are only resolved in the next tick.
 */
const flushPromises = () => new Promise((resolve) => process.nextTick(resolve))

const advanceTimersToNextTimerAndFlush = async () => {
  jest.advanceTimersToNextTimer()
  await flushPromises()
}

const getConfig = (config?: Partial<HttpTemperatureConfig>) => {
  const result = HttpTemperatureConfigSchema.safeParse({
    name: 'name',
    url: 'http://localhost',
    ...config,
  })
  if (result.success) return result.data
  throw result.error
}

const getTemperatureServiceMethod = (
  config?: Partial<HttpTemperatureConfig>,
  callback: (currentTemperature: number | null) => void = jest.fn(),
) => {
  const ts = TemperatureService.withAccessoryConfig(getConfig(config), callback)
  return {
    getTemperature: ts['getTemperature'].bind(ts),
    getCurrentTemperature: ts['getCurrentTemperature'].bind(ts),
    getFetchTemperatureRequest: ts['getFetchTemperatureRequest'].bind(ts),
    parseTemperatureFromResponse: ts['parseTemperatureFromResponse'].bind(ts),
  }
}

const getHttpServer = (abortController: AbortController) => {
  const app = express()

  app.get('/', (req, res) => {
    res.json({ temperature: 5 })
  })

  app.get('/timeout', (req, res) => {
    setTimeout(() => res.json({ temperature: 5 }), 1000)
  })

  app.get('/invalid', (req, res) => {
    res.send('temperature: 5')
  })

  const server = http
    .createServer(app)
    .listen({ port: 0, signal: abortController.signal })

  return server
}

/**
 * Calls/awaits `fn` and returns the elapsed time.
 * Only to be used with fake timers.
 */
const getElapsedTime = async <T>(fn: () => T) => {
  const before = jest.now()
  await fn()
  const after = jest.now()
  return after - before
}

jest.useFakeTimers({ doNotFake: ['nextTick'] })

describe('TemperatureService', () => {
  describe('constructor()', () => {
    let getTemperatureMock: jest.SpyInstance<
      ReturnType<typeof TemperatureService.prototype.getTemperature>
    >

    beforeAll(() => {
      getTemperatureMock = jest
        .spyOn(TemperatureService.prototype, 'getTemperature')
        .mockResolvedValue(5)
    })

    afterEach(() => {
      jest.clearAllTimers()
      getTemperatureMock.mockClear()
    })

    afterAll(() => getTemperatureMock.mockRestore())

    test('call getTemperature() every `update_interval` miliseconds', async () => {
      const update_interval = 100000
      expect(getTemperatureMock).toHaveBeenCalledTimes(0)
      getTemperatureServiceMethod({
        update_interval,
      })
      for (let i = 1; i <= 5; i++) {
        const elapsed = await getElapsedTime(advanceTimersToNextTimerAndFlush)
        expect(getTemperatureMock).toHaveBeenCalledTimes(i)
        expect(elapsed).toBe(update_interval)
      }
    })

    test('dont set interval if update_interval == 0', () => {
      expect(getTemperatureMock).toHaveBeenCalledTimes(0)
      getTemperatureServiceMethod({
        update_interval: 0,
      })
      expect(getTemperatureMock).not.toHaveBeenCalled()
    })

    test('calls callback with current temperature', async () => {
      const callback = jest.fn()
      getTemperatureServiceMethod({}, callback)
      expect(callback).not.toHaveBeenCalled()
      await advanceTimersToNextTimerAndFlush()
      expect(callback).toHaveBeenCalledWith(5)
    })

    test('calls callback with `null` on error', async () => {
      getTemperatureMock.mockRejectedValueOnce(new Error())
      const callback = jest.fn()
      getTemperatureServiceMethod({}, callback)
      expect(callback).not.toHaveBeenCalled()
      await advanceTimersToNextTimerAndFlush()
      expect(callback).toHaveBeenCalledWith(null)
    })
  })

  describe('getCurrentTemperature()', () => {
    let getTemperatureMock: jest.SpyInstance<
      ReturnType<typeof TemperatureService.prototype.getTemperature>
    >

    beforeAll(() => {
      getTemperatureMock = jest
        .spyOn(TemperatureService.prototype, 'getTemperature')
        .mockResolvedValue(5)
    })

    beforeEach(() => getTemperatureMock.mockClear())

    afterAll(() => getTemperatureMock.mockRestore())

    test('returns the current temperature from cache', async () => {
      const { getCurrentTemperature } = getTemperatureServiceMethod()

      expect(await getCurrentTemperature()).toBe(null)
      expect(getTemperatureMock).not.toHaveBeenCalled()

      await advanceTimersToNextTimerAndFlush()

      expect(await getCurrentTemperature()).toBe(5)
      expect(getTemperatureMock).toHaveBeenCalledTimes(1)
    })

    test('fetches the current temperature if update_interval == 0', async () => {
      const { getCurrentTemperature } = getTemperatureServiceMethod({
        update_interval: 0,
      })
      const temperature = await getCurrentTemperature()
      expect(getTemperatureMock).toHaveBeenCalledTimes(1)
      expect(temperature).toBe(5)
    })

    test('sets the current temperature to `null` on error', async () => {
      getTemperatureMock.mockRejectedValueOnce(new Error())
      const { getCurrentTemperature } = getTemperatureServiceMethod({
        update_interval: 0,
      })
      const temperature = await getCurrentTemperature()
      expect(getTemperatureMock).toHaveBeenCalledTimes(1)
      expect(temperature).toBe(null)
    })
  })

  describe('getTemperature()', () => {
    const abortController = new AbortController()
    let addressInfo: AddressInfo

    beforeAll(() => {
      const server = getHttpServer(abortController)
      addressInfo = server.address() as AddressInfo
    })

    afterAll(() => abortController.abort())

    test('returns temperature for a valid response', async () => {
      const { getTemperature } = getTemperatureServiceMethod({
        url: `http://localhost:${addressInfo.port}`,
      })
      const temperature = await getTemperature()
      expect(temperature).toBe(5)
    })

    test('request is aborted and returns `null` after timeout', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort')

      const { getTemperature } = getTemperatureServiceMethod({
        url: `http://localhost:${addressInfo.port}/timeout`,
        timeout: 100,
      })

      jest.useRealTimers()

      const temperature = await getTemperature()
      expect(abortSpy).toBeCalledTimes(1)
      expect(temperature).toBe(null)
      abortSpy.mockRestore()

      jest.useFakeTimers()
    })

    test('throws for an invalid response', async () => {
      const { getTemperature } = getTemperatureServiceMethod({
        url: `http://localhost:${addressInfo.port}/invalid`,
      })
      await expect(getTemperature()).rejects.toThrow()
    })
  })

  describe('getFetchTemperatureRequest()', () => {
    test('sets the fetch url', () => {
      const { getFetchTemperatureRequest } = getTemperatureServiceMethod({
        url: 'http://example.com/',
      })
      const request = getFetchTemperatureRequest(new AbortController())
      expect(request.url).toBe('http://example.com/')
    })

    test('adds custom headers to request', () => {
      const { getFetchTemperatureRequest } = getTemperatureServiceMethod({
        http_headers: { 'X-Test': 'Test-Value' },
      })
      const request = getFetchTemperatureRequest(new AbortController())
      expect(request.headers.has('X-Test')).toBe(true)
      expect(request.headers.get('X-Test')).toBe('Test-Value')
    })

    test('sets basic auth if specified', () => {
      const { getFetchTemperatureRequest } = getTemperatureServiceMethod({
        auth: {
          user: 'test-user',
          pass: 'test-pass',
        },
      })
      const request = getFetchTemperatureRequest(new AbortController())
      expect(request.headers.has('Authorization')).toBe(true)

      const [type, auth] = (request.headers.get('Authorization') ?? '').split(
        ' ',
      )
      expect(type).toBe('Basic')
      expect(Buffer.from(auth, 'base64').toString('ascii')).toBe(
        'test-user:test-pass',
      )
    })

    test('sets request method', () => {
      const { getFetchTemperatureRequest } = getTemperatureServiceMethod({
        http_method: 'POST',
      })
      const request = getFetchTemperatureRequest(new AbortController())
      expect(request.method).toBe('POST')
    })
  })

  describe('parseTemperatureFromResponse()', () => {
    test.each<{
      res: string
      expected: number
      config?: Partial<HttpTemperatureConfig>
    }>([
      { res: '{ "temperature": 5 }', expected: 5 },
      { res: '{ "temperature": "5" }', expected: 5 },
      { res: '{ "temp": 5 }', expected: 5, config: { field_name: 'temp' } },
      { res: '5', expected: 5, config: { field_name: '' } },
      {
        res: '{ "data": { "temperature": 5 } }',
        expected: 5,
        config: { field_name: 'data.temperature' },
      },
      {
        res: '{ "data": { "values": [ { "temperature": 5 }, { "temperature": 10 } ] } }',
        expected: 5,
        config: { field_name: 'data.values[0].temperature' },
      },
    ])(
      'parses response `%s` to temperature `%f` with config `%o`',
      async ({ res, expected, config }) => {
        const { parseTemperatureFromResponse } =
          getTemperatureServiceMethod(config)
        const response = new Response(res)
        const temperature = await parseTemperatureFromResponse(response)
        expect(temperature).toBe(expected)
      },
    )

    test.each<{
      res: string
      config?: Partial<HttpTemperatureConfig>
    }>([
      { res: '{ "temperature": "" }' },
      { res: '{ "temperature": null }' },
      { res: '{ "temperature": }' },
      { res: '{ "temperature": "null" }' },
      { res: '{ "temperature": [] }' },
      { res: '{ "temperature": [ 5 ] }' },
      { res: '{ "temperature": "a" }' },
      { res: '' },
      { res: '{ "temperature": 5 }', config: { field_name: '' } },
      { res: 'a', config: { field_name: '' } },
      { res: '', config: { field_name: '' } },
    ])(
      'throws for invalid response `%s` with config `%o`',
      async ({ res, config }) => {
        const { parseTemperatureFromResponse } =
          getTemperatureServiceMethod(config)
        const response = new Response(res)
        await expect(parseTemperatureFromResponse(response)).rejects.toThrow()
      },
    )
  })
})
