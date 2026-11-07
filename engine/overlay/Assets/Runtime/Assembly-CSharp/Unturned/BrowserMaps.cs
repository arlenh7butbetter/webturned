using System.Collections;
using System.Runtime.InteropServices;
using UnityEngine;

namespace SDG.Unturned
{
	public class BrowserMaps : MonoBehaviour
	{
		[DllImport("__Internal")]
		static extern void BrowserMaps_Load(string name);

		[DllImport("__Internal")]
		static extern int BrowserMaps_State(string name);

		static bool loading;

		public static bool Ready(string map, System.Action play)
		{
			if (BrowserMaps_State(map) == 1)
				return true;
			if (!loading)
			{
				loading = true;
				BrowserMaps_Load(map);
				BrowserMaps host = new GameObject("BrowserMaps").AddComponent<BrowserMaps>();
				host.StartCoroutine(host.Wait(map, play));
			}
			return false;
		}

		IEnumerator Wait(string map, System.Action play)
		{
			while (BrowserMaps_State(map) == 0)
				yield return null;
			loading = false;
			Destroy(gameObject);
			if (BrowserMaps_State(map) == 1)
				play();
			else
				UnturnedLog.error($"Could not download map {map}");
		}
	}
}
