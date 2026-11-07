using System.Collections.Generic;
using SDG.NetTransport;
using UnityEngine;

namespace SDG.Unturned
{
	public class ServerTransport_WebRTC : IServerTransport
	{
		readonly Dictionary<int, TransportConnection_WebRTC> connections = new Dictionary<int, TransportConnection_WebRTC>();
		ServerTransportConnectionFailureCallback connectionFailureCallback;
		bool announced;

		public void Initialize(ServerTransportConnectionFailureCallback connectionFailureCallback)
		{
			this.connectionFailureCallback = connectionFailureCallback;
			BrowserNet.BrowserNet_Host();
		}

		public void TearDown()
		{
			BrowserNet.BrowserNet_StopHosting();
			connections.Clear();
		}

		public bool Receive(byte[] buffer, out long size, out ITransportConnection transportConnection)
		{
			if (!announced && Player.player != null && BrowserNet.BrowserNet_RoomCode() != 0)
			{
				announced = true;
				string message = $"Friends can join with code {BrowserNet.BrowserNet_RoomCode()} (Play > Connect)";
				UnturnedLog.info(message);
				ChatManager.serverSendMessage(message, Color.yellow, toPlayer: Player.player.channel.owner);
			}

			int id;
			while ((id = BrowserNet.BrowserNet_ServerDisconnected()) != 0)
			{
				if (connections.Remove(id, out TransportConnection_WebRTC closed))
					connectionFailureCallback(closed, "WebRTC connection closed", false);
			}

			size = BrowserNet.BrowserNet_ServerReceive(buffer, buffer.Length, out id);
			if (size == 0)
			{
				transportConnection = null;
				return false;
			}

			if (!connections.TryGetValue(id, out TransportConnection_WebRTC connection))
			{
				connection = new TransportConnection_WebRTC(id);
				connections.Add(id, connection);
			}
			transportConnection = connection;
			return true;
		}
	}
}
