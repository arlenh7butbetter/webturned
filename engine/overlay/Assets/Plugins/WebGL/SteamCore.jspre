Module.steamSeen = new Set();
Module.steamMissing = function (name) {
  if (Module.steamSeen.has(name)) return;
  Module.steamSeen.add(name);
  console.warn("[steam] not implemented: " + name);
};
Module.steamAccount = Number(localStorage.getItem("webturned-account"));
if (!Module.steamAccount) {
  Module.steamAccount = 1 + Math.floor(Math.random() * 0x7ffffffe);
  localStorage.setItem("webturned-account", String(Module.steamAccount));
}
