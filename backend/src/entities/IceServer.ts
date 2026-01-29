import Global from "./Global";

export default class IceServer {
  async getIceServers(): Promise<any> {
    const config = await Global.ICE_SERVERS;
    const iceServers = Array.isArray(config?.iceServers)
      ? [...config.iceServers]
      : [];

    const stunEnabled = process.env.STUN_ENABLED !== "false";
    const stunHost = process.env.STUN_PUBLIC_HOST;
    const stunPort = Number(process.env.STUN_PORT) || 3478;
    if (stunEnabled && stunHost) {
      iceServers.unshift({ urls: `stun:${stunHost}:${stunPort}` });
    }

    return { ...config, iceServers };
  }
}
