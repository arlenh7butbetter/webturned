using System.Runtime.InteropServices;

namespace SDG.Unturned
{
	public static class BrowserNet
	{
		public static bool Hosting;

		public static bool Available => BrowserNet_Available() != 0;

		[DllImport("__Internal")]
		static extern int BrowserNet_Available();

		[DllImport("__Internal")]
		internal static extern void BrowserNet_Host();

		[DllImport("__Internal")]
		internal static extern void BrowserNet_StopHosting();

		[DllImport("__Internal")]
		internal static extern int BrowserNet_RoomCode();

		[DllImport("__Internal")]
		internal static extern int BrowserNet_ServerReceive(byte[] buffer, int capacity, out int connection);

		[DllImport("__Internal")]
		internal static extern int BrowserNet_ServerDisconnected();

		[DllImport("__Internal")]
		internal static extern void BrowserNet_ServerSend(int connection, byte[] buffer, int size, bool reliable);

		[DllImport("__Internal")]
		internal static extern void BrowserNet_ServerClose(int connection);

		[DllImport("__Internal")]
		internal static extern void BrowserNet_Join(int room);

		[DllImport("__Internal")]
		internal static extern void BrowserNet_Leave();

		[DllImport("__Internal")]
		internal static extern int BrowserNet_ClientState();

		[DllImport("__Internal")]
		internal static extern int BrowserNet_ClientReceive(byte[] buffer, int capacity);

		[DllImport("__Internal")]
		internal static extern void BrowserNet_ClientSend(byte[] buffer, int size, bool reliable);
	}
}
