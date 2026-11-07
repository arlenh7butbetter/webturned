mergeInto(LibraryManager.library, {
  BrowserNet_Available: function () {
    return Module.net.available ? 1 : 0;
  },

  BrowserNet_Host: function () {
    Module.net.host();
  },

  BrowserNet_StopHosting: function () {
    Module.net.stopHosting();
  },

  BrowserNet_RoomCode: function () {
    return Module.net.room;
  },

  BrowserNet_ServerReceive: function (buffer, capacity, connection) {
    const message = Module.net.server.shift();
    if (!message) return 0;
    if (message.data.length > capacity) throw new Error("Network message of " + message.data.length + " bytes does not fit in " + capacity);
    HEAPU8.set(message.data, buffer >>> 0);
    HEAP32[connection >>> 2] = message.id;
    return message.data.length;
  },

  BrowserNet_ServerDisconnected: function () {
    return Module.net.disconnected.shift() ?? 0;
  },

  BrowserNet_ServerSend: function (id, buffer, size, reliable) {
    const connection = Module.net.connections.get(id);
    const channel = reliable ? connection?.reliable : connection?.unreliable;
    if (channel?.readyState === "open") channel.send(HEAPU8.slice(buffer >>> 0, (buffer >>> 0) + size));
  },

  BrowserNet_ServerClose: function (id) {
    Module.net.connections.get(id)?.pc.close();
  },

  BrowserNet_Join: function (room) {
    Module.net.join(room);
  },

  BrowserNet_Leave: function () {
    Module.net.leave();
  },

  BrowserNet_ClientState: function () {
    return Module.net.client?.state ?? -1;
  },

  BrowserNet_ClientReceive: function (buffer, capacity) {
    const data = Module.net.client?.queue.shift();
    if (!data) return 0;
    if (data.length > capacity) throw new Error("Network message of " + data.length + " bytes does not fit in " + capacity);
    HEAPU8.set(data, buffer >>> 0);
    return data.length;
  },

  BrowserNet_ClientSend: function (buffer, size, reliable) {
    const client = Module.net.client;
    const channel = reliable ? client?.connection.reliable : client?.connection.unreliable;
    if (channel?.readyState === "open") channel.send(HEAPU8.slice(buffer >>> 0, (buffer >>> 0) + size));
  },
});
