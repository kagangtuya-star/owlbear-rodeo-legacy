// 修补 XMLHttpRequest 在 arraybuffer/其他二进制响应类型下读取 responseText 时的异常
if (typeof window !== "undefined" && "XMLHttpRequest" in window) {
  const descriptor = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype,
    "responseText"
  );

  if (descriptor?.get) {
    const originalGet = descriptor.get;

    Object.defineProperty(XMLHttpRequest.prototype, "responseText", {
      configurable: descriptor.configurable ?? true,
      enumerable: descriptor.enumerable ?? false,
      get: function responseTextPatched(this: XMLHttpRequest) {
        try {
          return originalGet.call(this);
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "InvalidStateError"
          ) {
            const type = this.responseType as XMLHttpRequestResponseType;
            if (
              type === "arraybuffer" ||
              type === "blob" ||
              type === "document" ||
              type === "json"
            ) {
              return "";
            }
          }
          throw error;
        }
      },
    });
  }
}

export {};
