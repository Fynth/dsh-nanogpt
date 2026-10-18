/** Ambient surface available to the DSH browser module table. */
declare function require(name: string): any
declare const module: any
interface Window {
  __ModuleLoader__: {
    load(input: { id: string; factory(require: (name: string) => any): any }): void
  }
}
declare const window: Window
declare module 'react' {
  const React: any
  export = React
}
