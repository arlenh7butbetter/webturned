mergeInto(LibraryManager.library, {
  BrowserPage_Reload: function () {
    Module.syncSaves(function () { location.reload(); });
  },
});
