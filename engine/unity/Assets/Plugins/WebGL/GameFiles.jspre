window.unturnedFiles = {
  read: function (path) { return FS.readFile(path, { encoding: "utf8" }); },
  list: function (path) { return FS.readdir(path); },
};
Module.preRun = Module.preRun || [];
Module.preRun.push(function () {
  for (const file of Module.unturnedFiles) {
    const slash = file.path.lastIndexOf("/");
    FS.createPath("/", file.path.slice(0, slash), true, true);
    FS.writeFile(file.path, file.data);
  }
  Module.unturnedFiles.length = 0;
});
