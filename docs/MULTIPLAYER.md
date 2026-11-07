# Multiplayer design

Status: built. Hosting, joining, loading into the host's world and position sync were checked with two headless browsers. Walking sync, combat between players and voice chat haven't been tested.

## Goal

Friends play together in their browsers. No game server: one player's browser hosts, and game traffic goes directly between browsers over WebRTC data channels.

## How players find each other

Browsers can't connect to each other without first exchanging connection details (WebRTC offers, answers and ICE candidates). A small Node.js signaling server in `networking/` does only that:

- The host opens a room and gets a short room code.
- A joining player sends the code, and the server relays connection details between the two browsers.
- Once the data channels are open, the signaling server is no longer involved.

It uses plain HTTP: Server-Sent Events to receive and POST to send, so it needs no dependencies and runs on any Node host. The page reads the signaling URL from `window.unturnedSignalUrl`, the same way it reads the package URL.

NAT traversal uses public STUN servers. Some networks, such as strict school or corporate firewalls, block direct connections. Those need a TURN relay, which can be added to the ICE server list later.

## Hosting inside the game

Singleplayer already runs the server and client in one process. Unturned's `Provider` has a server receive loop that only runs on dedicated servers, with a developer note about enabling it for P2P. Hosting turns that loop on while the host plays, and adds a WebRTC server transport.

Unturned already abstracts its networking:

- `SDG.NetTransport.IClientTransport`: one connection to a server.
- `SDG.NetTransport.IServerTransport` and `ITransportConnection`: many client connections.
- `NetTransportFactory` picks the implementation.

The WebRTC versions live in `engine/overlay`, with a `.jslib` bridge. Each peer gets two data channels: one reliable and ordered for `ENetReliability.Reliable`, and one unordered with no retransmits for unreliable traffic. Messages queue in JavaScript, and the C# side polls them from `Receive`, as the Steam transports do.

## Identity and authentication

Steam is simulated offline, so:

- Each browser gets a random, persistent Steam ID and a player name, stored in the browser.
- The host runs with `Dedicator.offlineOnly`, Unturned's existing mode for offline LAN servers, which skips Steam authentication.
- The client still sends a small placeholder auth ticket, because the join flow expects one.

## Listen server changes

Unturned never shipped listen servers, so a few places assumed that a non-dedicated server has no remote clients:

- Client RPCs were always invoked locally. Now only the loopback connection is.
- Region data (items, barricades, structures, resources and objects) and player positions were only sent by dedicated servers. Now a host sends them to remote players, but not to its own loopback client.
- The host's own player was told about new players, and remote players were spawned from the client prefab without a `CharacterController`.
- Asset integrity hashes were compared without the masterbundle hash on non-dedicated servers, while clients included it.
- `ReadWrite.readData` hashes `Assembly-CSharp.dll`, which doesn't exist in a WebAssembly build, so it returns an empty hash like the resource hash does when it can't be computed.

## Joining

The joining player enters the room code, connects, and receives the host's map name. The client downloads that map through the existing on-demand map loading before it loads the level.

## Still to do

- Test a real play session: walking, shooting each other, vehicles, items and building.
- Voice chat: Steam's voice encoder doesn't exist in the browser, so voice is silent.
- A TURN relay for networks that block direct connections.
