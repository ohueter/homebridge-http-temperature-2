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

const getParseTemperatureFromResponse = (
  config?: Partial<HttpTemperatureConfig>,
) => {
  const ts = TemperatureService.withAccessoryConfig(
    getConfig(config),
    jest.fn(),
  )
  type P = Parameters<TemperatureService['parseTemperatureFromResponse']>
  return (...res: P) => ts['parseTemperatureFromResponse'](...res)
}

describe('TemperatureService', () => {
  describe('parseTemperatureFromResponse', () => {
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
        const parseTemperatureFromResponse =
          getParseTemperatureFromResponse(config)
        const response = new Response(res)
        const temperature = await parseTemperatureFromResponse(response)
        expect(temperature).toBe(expected)
      },
    )
  })
})
