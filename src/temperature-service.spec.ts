import { Response } from 'node-fetch'
import {
  HttpTemperatureConfigSchema,
  type HttpTemperatureConfig,
} from './config'
import { TemperatureService } from './temperature-service'

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

describe('TemperatureService', () => {
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
