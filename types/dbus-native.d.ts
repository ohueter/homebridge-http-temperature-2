/**
 * Woraround for: https://github.com/homebridge/homebridge/issues/3275
 * (TypeScript plugins do not build with noImplicitAny: true in 1.6.0)
 *
 * Types taken from: https://github.com/homebridge/HAP-NodeJS
 * File: HAP-NodeJS/src/types/dbus-native.d.ts
 */

declare module '@homebridge/dbus-native' {
  import { EventEmitter } from 'events'
  import { Socket } from 'net'

  function systemBus(): MessageBus

  export class InvokeError {
    name: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any
  }

  export class MessageBus {
    connection: BusConnection

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-explicit-any
    public invoke(
      message: any,
      callback: (error: InvokeError | undefined, value: any) => void,
    ): void

    public getService(name: string): DBusService
  }

  export class BusConnection extends EventEmitter {
    public stream: Socket
  }

  export class DBusService {
    public name: string
    public bus: MessageBus

    // the dbus object has additional properties `proxy` and `nodes´ added to it!
    public getObject(
      name: string,
      callback: (error: null | Error, obj?: DBusObject) => void,
    ): DBusObject
    public getInterface(
      objName: string,
      ifaceName: string,
      callback: (error: null | Error, iface?: DBusInterface) => void,
    ): void
  }

  export class DBusObject {
    public name: string
    public service: DBusService

    public as(name: string): DBusInterface
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class DBusInterface
    extends EventEmitter
    implements Record<string, any>
  {
    public $parent: DBusObject
    public $name: string // string interface name
  }
}
