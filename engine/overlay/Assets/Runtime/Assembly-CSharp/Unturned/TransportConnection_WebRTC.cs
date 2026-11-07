using System.Net;
using SDG.NetTransport;

namespace SDG.Unturned
{
	public class TransportConnection_WebRTC : ITransportConnection
	{
		readonly int id;

		public TransportConnection_WebRTC(int id)
		{
			this.id = id;
		}

		public bool TryGetIPv4Address(out uint address)
		{
			address = 0;
			return false;
		}

		public bool TryGetPort(out ushort port)
		{
			port = 0;
			return false;
		}

		public bool TryGetSteamId(out ulong steamId)
		{
			steamId = 0;
			return false;
		}

		public IPAddress GetAddress() => null;

		public string GetAddressString(bool withPort) => $"webrtc-{id}";

		public void CloseConnection() => BrowserNet.BrowserNet_ServerClose(id);

		public void Send(byte[] buffer, long size, ENetReliability reliability)
		{
			BrowserNet.BrowserNet_ServerSend(id, buffer, (int) size, reliability == ENetReliability.Reliable);
		}

		public bool Equals(ITransportConnection other) => other is TransportConnection_WebRTC connection && connection.id == id;

		public override bool Equals(object obj) => obj is ITransportConnection other && Equals(other);

		public override int GetHashCode() => id;

		public override string ToString() => GetAddressString(false);
	}
}
