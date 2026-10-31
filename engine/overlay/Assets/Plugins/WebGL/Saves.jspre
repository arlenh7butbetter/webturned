Module.preRun = Module.preRun || [];
Module.preRun.push(function () {
  for (const path of ["game/Worlds", "game/Cloud", "game/SteamCloud"]) {
    FS.createPath("/", path, true, true);
    FS.mount(IDBFS, {}, "/" + path);
  }
  addRunDependency("unturned-saves");
  FS.syncfs(true, function (error) {
    if (error) console.error("Could not load saved games", error);
    removeRunDependency("unturned-saves");
  });

  let syncing = false;
  Module.syncSaves = function (done) {
    if (syncing) {
      setTimeout(function () { Module.syncSaves(done); }, 100);
      return;
    }
    syncing = true;
    FS.syncfs(false, function (error) {
      syncing = false;
      if (error) console.error("Could not store saved games", error);
      if (done) done();
    });
  };
  setInterval(function () { Module.syncSaves(); }, 20000);
  addEventListener("pagehide", function () { Module.syncSaves(); });
});
