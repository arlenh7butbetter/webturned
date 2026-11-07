mergeInto(LibraryManager.library, {
  $steamString__deps: ["$lengthBytesUTF8", "$stringToUTF8", "malloc"],
  $steamString: function (text) {
    const size = lengthBytesUTF8(text) + 1;
    const pointer = _malloc(size);
    stringToUTF8(text, pointer, size);
    return pointer;
  },

  SteamAPI_Init: function () { return 1; },
  SteamAPI_InitSafe: function () { return 1; },
  SteamInternal_SteamAPI_Init: function () { return 0; },
  SteamAPI_RestartAppIfNecessary: function () { return 0; },
  SteamAPI_IsSteamRunning: function () { return 1; },
  SteamAPI_Shutdown: function () {},
  SteamAPI_RunCallbacks: function () {},
  SteamAPI_GetHSteamPipe: function () { return 1; },
  SteamAPI_GetHSteamUser: function () { return 1; },
  SteamGameServer_GetHSteamPipe: function () { return 2; },
  SteamGameServer_GetHSteamUser: function () { return 2; },
  SteamInternal_CreateInterface: function () { return 1; },
  SteamInternal_FindOrCreateUserInterface: function () { return 1; },
  SteamInternal_FindOrCreateGameServerInterface: function () { return 1; },
  SteamAPI_ManualDispatch_Init: function () {},
  SteamAPI_ManualDispatch_RunFrame: function () {},
  SteamAPI_ManualDispatch_GetNextCallback: function () { return 0; },
  SteamAPI_ManualDispatch_FreeLastCallback: function () {},

  SteamAPI_ISteamClient_GetISteamUser: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamGameServer: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamFriends: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamUtils: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamMatchmaking: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamMatchmakingServers: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamGenericInterface: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamUserStats: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamGameServerStats: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamApps: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamNetworking: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamRemoteStorage: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamScreenshots: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamGameSearch: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamHTTP: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamController: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamUGC: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamAppList: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamMusic: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamMusicRemote: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamHTMLSurface: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamInventory: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamVideo: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamParentalSettings: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamInput: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamParties: function () { return 1; },
  SteamAPI_ISteamClient_GetISteamRemotePlay: function () { return 1; },

  SteamAPI_ISteamApps_GetAppInstallDir__deps: ["$stringToUTF8"],
  SteamAPI_ISteamApps_GetAppInstallDir: function (self, app, folder, size) {
    stringToUTF8("/game", folder, size);
    return 5;
  },
  SteamAPI_ISteamApps_GetCurrentGameLanguage__deps: ["$steamString"],
  SteamAPI_ISteamApps_GetCurrentGameLanguage: function () { return steamString("english"); },
  SteamAPI_ISteamApps_GetLaunchCommandLine: function () { return 0; },
  SteamAPI_ISteamApps_BIsSubscribed: function () { return 1; },
  SteamAPI_ISteamApps_BIsSubscribedApp: function () { return 1; },

  SteamAPI_ISteamUser_GetSteamID: function () { return 76561197960265728n + BigInt(Module.steamAccount); },
  SteamAPI_ISteamUser_BLoggedOn: function () { return 1; },
  SteamAPI_ISteamUser_GetVoiceOptimalSampleRate: function () { return 24000; },
  SteamAPI_ISteamUser_GetAuthSessionTicket: function (self, ticket, capacity, size) {
    for (let i = 0; i < 4; i++) HEAPU8[(ticket >>> 0) + i] = (Module.steamAccount >>> (8 * i)) & 255;
    HEAPU32[size >>> 2] = 4;
    return 1;
  },

  SteamAPI_ISteamFriends_GetPersonaName__deps: ["$steamString"],
  SteamAPI_ISteamFriends_GetPersonaName: function () { return steamString("Player " + (Module.steamAccount % 10000)); },

  SteamAPI_ISteamUtils_GetAppID: function () { return 304930; },
  SteamAPI_ISteamUtils_GetServerRealTime: function () { return Math.floor(Date.now() / 1000); },
  SteamAPI_ISteamUtils_GetSteamUILanguage__deps: ["$steamString"],
  SteamAPI_ISteamUtils_GetSteamUILanguage: function () { return steamString("english"); },
  SteamAPI_ISteamUtils_IsOverlayEnabled: function () { return 0; },
  SteamAPI_ISteamUtils_SetWarningMessageHook: function () {},

  $steamCloudPath__deps: ["$UTF8ToString"],
  $steamCloudPath: function (pointer) {
    return "/game/SteamCloud/" + UTF8ToString(pointer).replace(/^\/+/, "");
  },
  SteamAPI_ISteamRemoteStorage_FileExists__deps: ["$steamCloudPath", "$FS"],
  SteamAPI_ISteamRemoteStorage_FileExists: function (self, file) {
    return FS.analyzePath(steamCloudPath(file)).exists ? 1 : 0;
  },
  SteamAPI_ISteamRemoteStorage_GetFileSize__deps: ["$steamCloudPath", "$FS"],
  SteamAPI_ISteamRemoteStorage_GetFileSize: function (self, file) {
    const path = steamCloudPath(file);
    return FS.analyzePath(path).exists ? FS.stat(path).size : 0;
  },
  SteamAPI_ISteamRemoteStorage_FileRead__deps: ["$steamCloudPath", "$FS"],
  SteamAPI_ISteamRemoteStorage_FileRead: function (self, file, data, size) {
    const path = steamCloudPath(file);
    if (!FS.analyzePath(path).exists) return 0;
    const bytes = FS.readFile(path);
    const count = Math.min(bytes.length, size);
    HEAPU8.set(bytes.subarray(0, count), data);
    return count;
  },
  SteamAPI_ISteamRemoteStorage_FileWrite__deps: ["$steamCloudPath", "$FS"],
  SteamAPI_ISteamRemoteStorage_FileWrite: function (self, file, data, size) {
    const path = steamCloudPath(file);
    FS.createPath("/", path.slice(1, path.lastIndexOf("/")), true, true);
    FS.writeFile(path, HEAPU8.subarray(data, data + size));
    return 1;
  },
  SteamAPI_ISteamRemoteStorage_FileDelete__deps: ["$steamCloudPath", "$FS"],
  SteamAPI_ISteamRemoteStorage_FileDelete: function (self, file) {
    const path = steamCloudPath(file);
    if (!FS.analyzePath(path).exists) return 0;
    FS.unlink(path);
    return 1;
  },
});
