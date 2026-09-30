import assert from "node:assert/strict";
import test from "node:test";
import { TLSSocket } from "node:tls";
import grpc from "@grpc/grpc-js";
import { BaseServerInterceptingCall } from "@grpc/grpc-js/build/src/server-interceptors.js";

const serialize = (value) => Buffer.from(JSON.stringify(value));
const deserialize = (value) => JSON.parse(value.toString("utf8"));
const methodPath = "/sqr.DependencyRegression/Unary";
const service = {
  unary: {
    path: methodPath,
    requestStream: false,
    responseStream: false,
    requestSerialize: serialize,
    requestDeserialize: deserialize,
    responseSerialize: serialize,
    responseDeserialize: deserialize,
  },
};

async function createLocalClient(t, handler) {
  // Isolated ephemeral loopback transport: no application bootstrap, .env,
  // external collector, proxy, credentials, or database is involved.
  const server = new grpc.Server();
  let client;
  t.after(() => {
    client?.close();
    server.forceShutdown();
  });
  server.addService(service, { unary: handler });
  const port = await new Promise((resolve, reject) => {
    server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error);
      else resolve(boundPort);
    });
  });
  client = new grpc.Client(`ipv4:127.0.0.1:${port}`, grpc.credentials.createInsecure(), {
    "grpc.enable_http_proxy": 0,
  });
  return (request) => new Promise((resolve, reject) => {
    client.makeUnaryRequest(
      methodPath,
      serialize,
      deserialize,
      request,
      { deadline: Date.now() + 5_000 },
      (error, response) => {
        if (error) reject(error);
        else resolve(response);
      },
    );
  });
}

test("patched gRPC preserves ordinary unary requests on an isolated loopback server", { timeout: 10_000 }, async (t) => {
  let authContext;
  const call = await createLocalClient(t, (request, respond) => {
    authContext = request.getAuthContext();
    respond(null, { received: request.request.message });
  });

  assert.deepEqual(await call({ message: "SQR dependency compatibility" }), {
    received: "SQR dependency compatibility",
  });
  assert.deepEqual(authContext, {});
});

test("gRPC does not disclose synchronous handler exception details by default", { timeout: 10_000 }, async (t) => {
  const syntheticDetail = "synthetic-private-handler-detail-not-a-real-secret";
  const call = await createLocalClient(t, () => {
    throw new Error(syntheticDetail);
  });

  await assert.rejects(call({ message: "exercise error handling" }), (error) => {
    assert.equal(error.code, grpc.status.UNKNOWN);
    assert.equal(error.details, "Unknown error");
    assert.equal(error.message.includes(syntheticDetail), false);
    return true;
  });
});

test("gRPC auth context does not trust an unauthorized TLS peer certificate", () => {
  // Exercise the authentication boundary without a TLS listener, certificates,
  // or handshake: this socket is never connected to any host.
  const socket = new TLSSocket();
  let certificateReads = 0;
  socket.getPeerCertificate = () => {
    certificateReads += 1;
    return { raw: Buffer.from("synthetic-unverified-certificate") };
  };
  try {
    assert.equal(socket.authorized, false);
    const context = BaseServerInterceptingCall.prototype.getAuthContext.call({
      stream: { session: { socket } },
    });
    assert.deepEqual(context, {});
    assert.equal(certificateReads, 0);
  } finally {
    socket.destroy();
  }
});
