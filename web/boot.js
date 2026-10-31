const canvas = document.getElementById("game");
const statusLine = document.getElementById("status");

function blobUrl(data, type) {
  return URL.createObjectURL(new Blob([data], { type }));
}

async function boot() {
  const map = new URLSearchParams(location.search).get("map") || "PEI";
  statusLine.textContent = "Reading package";
  const pkg = await openPackage(window.unturnedPackageUrl ?? "game.unturned");

  const unturnedFiles = [];
  const wanted = [...pkg.entries.values()].filter((entry) => entry.group === "game" || entry.group === `map/${map}`);
  if (!wanted.some((entry) => entry.group === `map/${map}`)) throw new Error(`Package has no map named ${map}`);
  statusLine.textContent = "Downloading game data";
  await pkg.preload(wanted);
  for (const [index, entry] of wanted.entries()) {
    statusLine.textContent = `Loading game data ${index + 1}/${wanted.length}`;
    unturnedFiles.push({ path: `/${entry.path}`, data: await pkg.read(entry.path) });
  }

  statusLine.textContent = "Loading player";
  const instance = await createUnityInstance(canvas, {
    dataUrl: blobUrl(await pkg.read("player/game.data"), "application/octet-stream"),
    frameworkUrl: blobUrl(await pkg.read("player/game.framework.js"), "text/javascript"),
    codeUrl: blobUrl(await pkg.read("player/game.wasm"), "application/wasm"),
    companyName: "unturned-web-port",
    productName: "Unturned Web Port",
    productVersion: pkg.build,
    unturnedFiles,
    unturnedMap: map,
    errorHandler: (message) => {
      console.error(message);
      statusLine.hidden = false;
      statusLine.textContent = `Error: ${message}`;
      return true;
    },
  }, (progress) => {
    statusLine.textContent = `Starting ${Math.round(progress * 100)}%`;
  });

  statusLine.hidden = true;
  window.unturned = instance;
}

boot().catch((error) => {
  statusLine.textContent = `Failed: ${error.message}`;
  console.error(error);
});
