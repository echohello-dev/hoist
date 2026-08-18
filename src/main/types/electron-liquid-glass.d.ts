declare module 'electron-liquid-glass' {
  export interface LiquidGlassOptions {
    cornerRadius?: number
    tintColor?: string
  }
  export default function addView(
    nativeWindowHandle: Buffer,
    options?: LiquidGlassOptions,
  ): void
}
