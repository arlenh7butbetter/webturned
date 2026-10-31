using System.Runtime.InteropServices;

namespace SDG.Unturned
{
	public static class BrowserPage
	{
		[DllImport("__Internal")]
		public static extern void BrowserPage_Reload();
	}
}
