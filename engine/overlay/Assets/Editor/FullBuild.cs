using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Player;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

public static class FullBuild
{
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

    public static void BuildPlayer()
    {
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;
        PlayerSettings.WebGL.nameFilesAsHashes = false;
        PlayerSettings.WebGL.dataCaching = false;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
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
