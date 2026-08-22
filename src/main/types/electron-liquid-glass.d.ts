declare module 'electron-liquid-glass' {
  export interface LiquidGlassOptions {
    cornerRadius?: number
    tintColor?: string
    opaque?: boolean
  }
  export interface LiquidGlass {
    isGlassSupported(): boolean
    addView(nativeWindowHandle: Buffer, options?: LiquidGlassOptions): number
    unstable_setVariant(id: number, variant: number): void
    unstable_setScrim(id: number, scrim: number): void
    unstable_setSubdued(id: number, subdued: number): void
  }
  const liquidGlass: LiquidGlass
  export default liquidGlass
}
