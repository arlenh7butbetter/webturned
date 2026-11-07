using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Player;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

public static class FullBuild
{
    static readonly string[] BuiltInBundleShaders = { "Mobile/Particles/Additive", "Particles/Standard Surface", "Particles/Standard Unlit", "Unlit/Texture" };

    public static void CompilePlayer()
    {
        var output = Environment.GetEnvironmentVariable("UNTURNED_PLAYER_SCRIPTS");
        var result = PlayerBuildInterface.CompilePlayerScripts(new ScriptCompilationSettings
        {
            target = BuildTarget.WebGL,
            group = BuildTargetGroup.WebGL,
            options = ScriptCompilationOptions.None
        }, output);

        Debug.Log($"[compile] player assemblies: {string.Join(" ", result.assemblies)}");
        if (!result.assemblies.Contains("Assembly-CSharp.dll"))
            EditorApplication.Exit(1);
    }

    public static void WaitForImport()
    {
        AssetDatabase.importPackageCompleted += _ => EditorApplication.Exit(0);
        AssetDatabase.importPackageFailed += (name, error) =>
        {
            Debug.LogError($"Importing {name} failed: {error}");
            EditorApplication.Exit(1);
        };
        var deadline = EditorApplication.timeSinceStartup + 180;
        EditorApplication.update += () =>
        {
            if (EditorApplication.timeSinceStartup > deadline)
                EditorApplication.Exit(1);
        };
    }

    static void IncludeBundleShaders()
    {
        var shaders = AssetDatabase.FindAssets("t:Shader", new[] { "Assets" })
            .Select(guid => AssetDatabase.LoadAssetAtPath<Shader>(AssetDatabase.GUIDToAssetPath(guid)))
            .Concat(BuiltInBundleShaders.Select(Shader.Find))
            .ToArray();
        if (shaders.Contains(null))
            throw new InvalidOperationException("A shader required by core.masterbundle is missing");

        var settings = new SerializedObject(AssetDatabase.LoadAssetAtPath<UnityEngine.Object>("ProjectSettings/GraphicsSettings.asset"));
        var included = settings.FindProperty("m_AlwaysIncludedShaders");
        var existing = Enumerable.Range(0, included.arraySize).Select(i => included.GetArrayElementAtIndex(i).objectReferenceValue).ToHashSet();
        foreach (var shader in shaders.Where(shader => !existing.Contains(shader)))
        {
            included.InsertArrayElementAtIndex(included.arraySize);
            included.GetArrayElementAtIndex(included.arraySize - 1).objectReferenceValue = shader;
        }
        settings.ApplyModifiedPropertiesWithoutUndo();
        Debug.Log($"[full] always included shaders: {included.arraySize}");
    }

    public static void BuildPlayer()
    {
        if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>("Assets/TextMesh Pro/Resources/TMP Settings.asset") == null)
            throw new InvalidOperationException("TMP Essential Resources are not imported");

        IncludeBundleShaders();

        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        PlayerSettings.WebGL.nameFilesAsHashes = false;
        PlayerSettings.WebGL.dataCaching = false;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.FullWithStacktrace;
        PlayerSettings.WebGL.maximumMemorySize = 4096;
        PlayerSettings.stripEngineCode = false;
        PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Minimal);
        PlayerSettings.WebGL.template = "APPLICATION:Minimal";

        var scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray();
        Debug.Log($"[full] scenes: {string.Join(" ", scenes)}");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = Environment.GetEnvironmentVariable("UNTURNED_WEB_OUTPUT"),
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        });

        Debug.Log($"[full] result {report.summary.result}, {report.summary.totalErrors} errors, {report.summary.totalSize} bytes, {report.summary.totalTime}");
        if (report.summary.result != BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }
}
