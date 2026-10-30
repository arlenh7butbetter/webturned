using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

public static class WebBuild
{
    const string ScenePath = "Assets/Scenes/Boot.unity";

    public static void Run()
    {
        var output = Environment.GetEnvironmentVariable("UNTURNED_WEB_OUTPUT");
        if (string.IsNullOrEmpty(output))
            throw new InvalidOperationException("UNTURNED_WEB_OUTPUT is not set");

        Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
        EditorSceneManager.SaveScene(EditorSceneManager.NewScene(NewSceneSetup.EmptyScene), ScenePath);

        IncludeTerrainShaders();

        PlayerSettings.productName = "Unturned Web Port";
        PlayerSettings.runInBackground = true;
        PlayerSettings.colorSpace = ColorSpace.Linear;
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        PlayerSettings.WebGL.nameFilesAsHashes = false;
        PlayerSettings.WebGL.dataCaching = false;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
        PlayerSettings.WebGL.memorySize = 512;
        PlayerSettings.WebGL.template = "APPLICATION:Minimal";

        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { ScenePath },
            locationPathName = output,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        });

        Debug.Log($"WebBuild result {report.summary.result}, {report.summary.totalErrors} errors, {report.summary.totalSize} bytes");
        if (report.summary.result != BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }

    static void IncludeTerrainShaders()
    {
        var settings = new SerializedObject(AssetDatabase.LoadAssetAtPath<UnityEngine.Object>("ProjectSettings/GraphicsSettings.asset"));
        var included = settings.FindProperty("m_AlwaysIncludedShaders");
        foreach (var name in new[] { "Nature/Terrain/Standard", "Hidden/TerrainEngine/Splatmap/Standard-AddPass", "Hidden/TerrainEngine/Splatmap/Standard-Base", "Hidden/TerrainEngine/Splatmap/Standard-BaseGen" })
        {
            var shader = Shader.Find(name);
            if (shader == null)
                throw new InvalidOperationException($"Missing shader {name}");
            var index = included.arraySize;
            included.InsertArrayElementAtIndex(index);
            included.GetArrayElementAtIndex(index).objectReferenceValue = shader;
        }
        settings.ApplyModifiedPropertiesWithoutUndo();
    }
}
