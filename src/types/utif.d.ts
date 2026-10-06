declare module 'utif' {
  interface IFD {
    width: number
    height: number
    data: Uint8Array
    isLE: boolean
    t256?: number[] // width
    t258?: number[] // bits per sample, one entry per channel
    t262?: number[] // photometric interpretation
    [tag: string]: unknown
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): IFD[]
    decodeImage(buffer: ArrayBuffer, ifd: IFD, ifds?: IFD[]): void
    toRGBA8(ifd: IFD): Uint8Array
  }
  export default UTIF
}
