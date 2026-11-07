using SDG.NetTransport;
using Unturned.SystemEx;

namespace SDG.Unturned
{
	public class ClientTransport_WebRTC : IClientTransport
	{
		ClientTransportReady readyCallback;
		ClientTransportFailure failureCallback;

		public void Initialize(ClientTransportReady callback, ClientTransportFailure failureCallback)
		{
			readyCallback = callback;
			this.failureCallback = failureCallback;
			BrowserNet.BrowserNet_Join((int) Provider.server.GetAccountID().m_AccountID);
		}

		public void TearDown() => BrowserNet.BrowserNet_Leave();

		public bool Receive(byte[] buffer, out long size)
		{
			size = 0;
			int state = BrowserNet.BrowserNet_ClientState();
			if (state == 1 && readyCallback != null)
			{
				ClientTransportReady ready = readyCallback;
				readyCallback = null;
				ready();
			}
			else if (state == -1 && failureCallback != null)
			{
				ClientTransportFailure failure = failureCallback;
				failureCallback = null;
				failure("Could not connect to the host");
				return false;
			}

			size = BrowserNet.BrowserNet_ClientReceive(buffer, buffer.Length);
			return size > 0;
		}

		public void Send(byte[] buffer, long size, ENetReliability reliability)
		{
			BrowserNet.BrowserNet_ClientSend(buffer, (int) size, reliability == ENetReliability.Reliable);
		}

		public bool TryGetIPv4Address(out IPv4Address address)
		{
			address = IPv4Address.Zero;
			return false;
		}

		public bool TryGetConnectionPort(out ushort connectionPort)
		{
			connectionPort = 0;
			return false;
		}

		public bool TryGetQueryPort(out ushort queryPort)
		{
			queryPort = 0;
			return false;
		}

		public bool TryGetPing(out int pingMs)
		{
			pingMs = 0;
			return false;
		}
	}
}
