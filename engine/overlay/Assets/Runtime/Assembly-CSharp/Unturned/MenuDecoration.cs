using System.IO;
using UnityEngine;

namespace SDG.Unturned
{
    public static class MenuDecoration
    {
        private static AssetBundle bundle;

        public static void Load()
        {
            if (bundle == null)
                bundle = AssetBundle.LoadFromFile(Path.Combine(ReadWrite.PATH, "Bundles", "Menu_Base.bundle"));
            if (bundle == null)
            {
                UnturnedLog.error("Failed to load menu decoration bundle");
                return;
            }

            foreach (string name in bundle.GetAllAssetNames())
            {
                GameObject root = Object.Instantiate(bundle.LoadAsset<GameObject>(name));
                foreach (Renderer renderer in root.GetComponentsInChildren<Renderer>(true))
                {
                    foreach (Material material in renderer.sharedMaterials)
                    {
                        if (material == null)
                            continue;
                        Shader shader = ShaderConsolidator.findConsolidatedShader(material.shader);
                        if (shader != null)
                            material.shader = shader;
                        else
                            UnturnedLog.warn("Unable to find menu decoration shader {0}", material.shader.name);
                    }
                }
                UnturnedLog.info("Loaded menu decoration {0} with {1} renderers", root.name, root.GetComponentsInChildren<Renderer>(true).Length);
            }
        }
    }
}
