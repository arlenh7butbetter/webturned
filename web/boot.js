const canvas = document.getElementById("game");
const statusLine = document.getElementById("status");

const requestPointerLock = canvas.requestPointerLock;
canvas.requestPointerLock = function (options) {
  return requestPointerLock.call(this, options)?.catch((error) => console.warn(`Pointer lock was not granted: ${error.message}`));
};

function blobUrl(data, type) {
  return URL.createObjectURL(new Blob([data], { type }));
}

async function readGroup(pkg, group, label) {
  const entries = [...pkg.entries.values()].filter((entry) => entry.group === group);
  if (!entries.length) throw new Error(`Package has no ${group}`);
  statusLine.textContent = `Downloading ${label}`;
  await pkg.preload(entries);
  const files = [];
  for (const [index, entry] of entries.entries()) {
    statusLine.textContent = `Loading ${label} ${index + 1}/${entries.length}`;
    files.push({ path: `/${entry.path}`, data: await pkg.read(entry.path) });
  }
  pkg.release();
  return files;
}

async function loadMapFiles(pkg, name) {
  statusLine.hidden = false;
  try {
    const files = await readGroup(pkg, `map/${name}`, name);
    statusLine.hidden = true;
    return files;
  } catch (error) {
    statusLine.textContent = `Could not load ${name}: ${error.message}`;
    throw error;
  }
}

async function boot() {
  const map = new URLSearchParams(location.search).get("map");
  statusLine.textContent = "Reading package";
  const pkg = await openPackage(window.unturnedPackageUrl ?? "game.unturned");

  const unturnedFiles = await readGroup(pkg, "game", "game data");
  const mapFiles = map ? await readGroup(pkg, `map/${map}`, map) : [];

  statusLine.textContent = "Loading player";
  const player = {
    dataUrl: blobUrl(await pkg.read("player/game.data"), "application/octet-stream"),
    frameworkUrl: blobUrl(await pkg.read("player/game.framework.js"), "text/javascript"),
    codeUrl: blobUrl(await pkg.read("player/game.wasm"), "application/wasm"),
  };
  const instance = await createUnityInstance(canvas, {
    ...player,
    companyName: "unturned-web-port",
    productName: "Webturned",
    productVersion: pkg.build,
    unturnedFiles: unturnedFiles.concat(mapFiles),
    mapStates: map ? { [map]: 1 } : {},
    loadedMapFiles: mapFiles.map((file) => file.path),
    loadMapFiles: (name) => loadMapFiles(pkg, name),
    errorHandler: (message) => {
      console.error(message);
      statusLine.hidden = false;
      statusLine.textContent = `Error: ${message}`;
      return true;
    },
  }, (progress) => {
    statusLine.textContent = `Starting ${Math.round(progress * 100)}%`;
  });

  for (const url of Object.values(player)) URL.revokeObjectURL(url);
  statusLine.hidden = true;
  window.unturned = instance;
}

boot().catch((error) => {
  statusLine.textContent = `Failed: ${error.message}`;
  console.error(error);
});
