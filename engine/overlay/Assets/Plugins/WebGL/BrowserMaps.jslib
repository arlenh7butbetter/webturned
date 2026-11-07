mergeInto(LibraryManager.library, {
  BrowserMaps_Load: function (name) {
    name = UTF8ToString(name);
    const states = Module.mapStates;
    if (states[name] === 0 || states[name] === 1) return;
    states[name] = 0;
    Module.loadMapFiles(name).then(function (files) {
      for (const path of Module.loadedMapFiles) FS.unlink(path);
      for (const other in states) if (states[other] === 1) delete states[other];
      for (const file of files) {
        FS.createPath("/", file.path.slice(0, file.path.lastIndexOf("/")), true, true);
        FS.writeFile(file.path, file.data);
      }
      Module.loadedMapFiles = files.map(function (file) { return file.path; });
      states[name] = 1;
    }, function (error) {
      console.error(error);
      states[name] = -1;
    });
  },

  BrowserMaps_State: function (name) {
    const state = Module.mapStates[UTF8ToString(name)];
    return state === undefined ? -1 : state;
  },
});
