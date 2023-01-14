import { HttpTemperatureConfigSchema } from './config'

describe('HttpTemperatureConfigSchema', () => {
  test('empty configuration is invalid', () => {
    const result = HttpTemperatureConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  test('incorrect minimal configuration is invalid', () => {
    const result = HttpTemperatureConfigSchema.safeParse({
      accessory: 'HttpTemperature2',
      url: '',
      name: '',
    })
    expect(result.success).toBe(false)
  })

  test('minimal configuration is valid', () => {
    const result = HttpTemperatureConfigSchema.safeParse({
      accessory: 'HttpTemperature2',
      url: 'http://localhost',
      name: 'Temperature Sensor',
    })
    expect(result.success).toBe(true)
  })

  test('additional keys are not allowed', () => {
    const result = HttpTemperatureConfigSchema.safeParse({
      accessory: 'HttpTemperature2',
      url: 'http://localhost',
      name: 'Temperature Sensor',
      additionalKey: 1,
    })
    expect(result.success).toBe(false)
  })

  test('default values are set', () => {
    const result = HttpTemperatureConfigSchema.safeParse({
      accessory: 'HttpTemperature2',
      url: 'http://localhost',
      name: 'Temperature Sensor',
    })
    expect(result.success).toBe(true)

    const {
      url,
      name,
      auth,
      debug,
      field_name,
      http_headers,
      http_method,
      manufacturer,
      model,
      serial,
      timeout,
      units,
      update_interval,
      // @ts-expect-error Ignore strict ZodResult type
    } = result.data

    expect(url).toBe('http://localhost')
    expect(name).toBe('Temperature Sensor')
    expect(auth).toBeUndefined()
    expect(debug).toBe(false)
    expect(field_name).toBe('temperature')
    expect(http_headers).toBeUndefined()
    expect(http_method).toBe('GET')
    expect(manufacturer).toBe('@metbosch')
    expect(model).toBe('Model not available')
    expect(serial).toBe('Non-defined serial')
    expect(timeout).toBe(5000)
    expect(units).toBe('C')
    expect(update_interval).toBe(120000)
  })
})
