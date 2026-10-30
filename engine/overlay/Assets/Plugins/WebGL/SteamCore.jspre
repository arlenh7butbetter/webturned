Module.steamSeen = new Set();
Module.steamMissing = function (name) {
  if (Module.steamSeen.has(name)) return;
  Module.steamSeen.add(name);
  console.warn("[steam] not implemented: " + name);
};
