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
  SteamInternal_CreateInterface: function () { return 1; },
  SteamInternal_FindOrCreateUserInterface: function () { return 1; },
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

  SteamAPI_ISteamUser_GetSteamID: function () { return 76561197960265729n; },
  SteamAPI_ISteamUser_BLoggedOn: function () { return 1; },

  SteamAPI_ISteamFriends_GetPersonaName__deps: ["$steamString"],
  SteamAPI_ISteamFriends_GetPersonaName: function () { return steamString("Player"); },

  SteamAPI_ISteamUtils_GetAppID: function () { return 304930; },
  SteamAPI_ISteamUtils_GetServerRealTime: function () { return Math.floor(Date.now() / 1000); },
  SteamAPI_ISteamUtils_GetSteamUILanguage__deps: ["$steamString"],
  SteamAPI_ISteamUtils_GetSteamUILanguage: function () { return steamString("english"); },
  SteamAPI_ISteamUtils_IsOverlayEnabled: function () { return 0; },
  SteamAPI_ISteamUtils_SetWarningMessageHook: function () {},
});
