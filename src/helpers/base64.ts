function toUint8Array(
  data: Uint8Array | ArrayBuffer | ArrayBufferView | number[] | null | undefined
): Uint8Array {
  if (!data) {
    return new Uint8Array();
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data);
  }
  throw new Error("unsupported_array_buffer_type");
}

export function uint8ToBase64(
  data: Uint8Array | ArrayBuffer | ArrayBufferView | number[] | null | undefined
): string {
  const buffer = toUint8Array(data);
  if (buffer.length === 0) {
    return "";
  }

  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < buffer.length; index += chunkSize) {
    const chunk = buffer.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}
export function base64ToUint8(source: string): Uint8Array {
  if (!source) {
    return new Uint8Array();
  }

  const binary = window.atob(source);
  const length = binary.length;
  const buffer = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    buffer[index] = binary.charCodeAt(index);
  }

  return buffer;
}
