Module.preRun = Module.preRun || [];
Module.preRun.push(function () {
  for (const file of Module.unturnedFiles) {
    const slash = file.path.lastIndexOf("/");
    FS.createPath("/", file.path.slice(0, slash), true, true);
    FS.writeFile(file.path, file.data);
  }
  Module.unturnedFiles = null;
});
