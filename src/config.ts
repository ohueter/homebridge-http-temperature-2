import type { AccessoryConfig } from 'homebridge'
import { z } from 'zod'

export const HttpTemperatureConfigSchema = z
  .object({
    // From Homebridge
    accessory: z.string().optional(),

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

export type HttpTemperatureConfig = z.infer<typeof HttpTemperatureConfigSchema>

export type HttpTemperatureAccessoryConfig = AccessoryConfig &
  HttpTemperatureConfig
