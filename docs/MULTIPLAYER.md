# Multiplayer design

Status: planned, not built yet.

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
- `BeginAuthSession` accepts tickets and fires `ValidateAuthTicketResponse_t` with `k_EAuthSessionResponseOK`, so the server's normal join path admits the player.

## Joining

The joining player enters the room code, connects, and receives the host's map name. The client downloads that map through the existing on-demand map loading before it loads the level.

## Build order

1. Signaling server and a JavaScript peer layer, tested with two headless browsers.
2. C# client and server transports, with the `.jslib` bridge.
3. Steam identity and authentication stubs.
4. Host mode: start a hosted game from the menu and show the room code.
5. Join flow and map download on the client.
6. Two-browser test: both players see each other move, shoot and take damage.
