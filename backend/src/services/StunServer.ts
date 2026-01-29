import stun from "stun";

type StunServerOptions = {
  enabled: boolean;
  port: number;
  host?: string;
};

export default class StunServer {
  private server?: any;

  start(options: StunServerOptions) {
    if (!options.enabled) {
      return;
    }
    if (this.server) {
      return;
    }

    const server = stun.createServer({ type: "udp4" });
    const { STUN_BINDING_RESPONSE, STUN_EVENT_BINDING_REQUEST } = stun.constants;
    const userAgent = `owlbear-rodeo-stun`;

    server.on(STUN_EVENT_BINDING_REQUEST, (request: any, rinfo: any) => {
      const message = stun.createMessage(STUN_BINDING_RESPONSE);
      message.addXorAddress(rinfo.address, rinfo.port);
      message.addSoftware(userAgent);
      server.send(message, rinfo.port, rinfo.address);
    });

    server.on("error", (error: any) => {
      console.error("STUN_SERVER_ERROR", error);
    });

    server.listen(options.port, options.host, () => {
      console.log(`stun server started at ${options.host || "0.0.0.0"}:${options.port}`);
    });

    this.server = server;
  }

  stop() {
    if (!this.server) {
      return;
    }
    this.server.close();
    this.server = undefined;
  }
}
