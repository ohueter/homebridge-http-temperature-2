import AbortController from 'abort-controller'
import { Response } from 'node-fetch'
import {
  HttpTemperatureConfigSchema,
  type HttpTemperatureConfig,
} from './config'
import { TemperatureService } from './temperature-service'

// jest.mock('abort-controller')

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

jest.useFakeTimers()

describe('TemperatureService', () => {
  describe('constructor()', () => {
    test.todo('set interval only if update_interval > 0')
    test.todo('call getTemperature() every `update_interval` miliseconds')
    test.todo('calls callback with current temperature')
    test.todo('calls callback with `null` on error')
  })

  describe('getCurrentTemperature()', () => {
    test.todo('returns the current temperature from cache')
    test.todo('fetches the current temperature if update_interval == 0')
  })

  describe('getFetchTemperatureRequest()', () => {
    test.todo('returns temperature for a valid response')
    test.todo('request is aborted after timeout')
    test.todo('returns `null` on request timeout')
    test.todo('throws for an invalid response')
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
