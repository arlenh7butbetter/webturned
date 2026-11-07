Module.net = (function () {
  const signalUrl = window.unturnedSignalUrl;
  const iceServers = window.unturnedIceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
  const net = { available: !!signalUrl, room: 0, server: [], disconnected: [], connections: new Map(), client: null, hosting: null, nextId: 1 };

  function post(message) {
    return fetch(signalUrl + "/send", { method: "POST", body: JSON.stringify(message) });
  }

  function link() {
    const pc = new RTCPeerConnection({ iceServers });
    const channels = [
      pc.createDataChannel("reliable", { negotiated: true, id: 0 }),
      pc.createDataChannel("unreliable", { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 }),
    ];
    for (const channel of channels) channel.binaryType = "arraybuffer";
    return { pc, reliable: channels[0], unreliable: channels[1] };
  }

  async function describe(pc, remote) {
    if (remote) await pc.setRemoteDescription(remote);
    await pc.setLocalDescription();
    if (pc.iceGatheringState !== "complete") {
      await new Promise((resolve) => pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") resolve();
      }));
    }
    return pc.localDescription;
  }

  function drop(id) {
    const connection = net.connections.get(id);
    if (!connection) return;
    net.connections.delete(id);
    connection.pc.close();
    net.disconnected.push(id);
  }

  net.host = function () {
    const events = new EventSource(signalUrl + "/events");
    const peers = new Map();
    let token;
    net.hosting = events;
    events.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "room") {
        net.room = Number(message.room);
        token = message.token;
      } else if (message.type === "join") {
        const id = net.nextId++;
        const connection = link();
        peers.set(message.peer, connection);
        net.connections.set(id, connection);
        for (const channel of [connection.reliable, connection.unreliable]) {
          channel.onmessage = (e) => net.server.push({ id, data: new Uint8Array(e.data) });
        }
        connection.reliable.onclose = () => drop(id);
        connection.pc.onconnectionstatechange = () => {
          if (connection.pc.connectionState === "failed") drop(id);
        };
        const description = await describe(connection.pc);
        post({ room: String(net.room), from: "host", token, to: message.peer, data: description });
      } else if (message.type === "signal") {
        await peers.get(message.from)?.pc.setRemoteDescription(message.data);
      } else if (message.type === "leave") {
        peers.delete(message.peer);
      }
    };
  };

  net.stopHosting = function () {
    net.hosting?.close();
    net.hosting = null;
    net.room = 0;
    for (const id of [...net.connections.keys()]) drop(id);
    net.server.length = 0;
    net.disconnected.length = 0;
  };

  net.join = function (room) {
    const client = { state: 0, queue: [], connection: link() };
    const { pc, reliable, unreliable } = client.connection;
    const events = new EventSource(signalUrl + "/events?room=" + room);
    let peer;
    let open = 0;
    net.client = client;
    for (const channel of [reliable, unreliable]) {
      channel.onmessage = (e) => client.queue.push(new Uint8Array(e.data));
      channel.onopen = () => {
        if (++open === 2) {
          client.state = 1;
          events.close();
        }
      };
      channel.onclose = () => { client.state = -1; };
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") client.state = -1;
    };
    events.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "welcome") {
        peer = message.peer;
      } else if (message.type === "missing") {
        client.state = -1;
        events.close();
      } else if (message.type === "signal") {
        const description = await describe(pc, message.data);
        post({ room: String(room), from: peer, to: "host", data: description });
      }
    };
    events.onerror = () => {
      if (client.state === 0 && events.readyState === EventSource.CLOSED) client.state = -1;
    };
  };

  net.leave = function () {
    net.client?.connection.pc.close();
    net.client = null;
  };

  return net;
})();
