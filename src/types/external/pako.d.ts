declare module "pako" {
  type BufferInput = Uint8Array | number[] | ArrayBuffer;

  export interface DeflateOptions {
    level?: number;
    windowBits?: number;
    memLevel?: number;
    strategy?: number;
    dictionary?: BufferInput;
  }

  export interface InflateOptions {
    windowBits?: number;
    to?: "string";
    dictionary?: BufferInput;
  }

  export function deflate(
    data: BufferInput | string,
    options?: DeflateOptions
  ): Uint8Array;

  export function inflate(
    data: BufferInput,
    options?: InflateOptions
  ): Uint8Array;
  export function deflateRaw(
    data: BufferInput | string,
    options?: DeflateOptions
  ): Uint8Array;

  export function inflateRaw(
    data: BufferInput,
    options?: InflateOptions
  ): Uint8Array;

  export interface PakoStatic {
    deflate: typeof deflate;
    inflate: typeof inflate;
    deflateRaw: typeof deflateRaw;
    inflateRaw: typeof inflateRaw;
  }

  const pako: PakoStatic;
  export default pako;
}
