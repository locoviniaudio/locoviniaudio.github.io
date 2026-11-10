/* Anotador rápido locoviniAUDIO: abre sin internet y sube los gastos cuando vuelve la señal. */
var CACHE = "anotador-v1";
var ARCHIVOS = ["./", "index.html", "manifest.webmanifest", "../libro/icono-192.png", "../libro/icono-512.png", "../libro/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* Primero lo guardado (abre al instante y sin señal); si hay internet, se actualiza por detrás. */
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var red = fetch(e.request).then(function (r) { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(function () { return hit; });
      return hit || red;
    });
  }));
});

function idb() { return new Promise(function (res, rej) { var r = indexedDB.open("anotador", 1); r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains("cola")) d.createObjectStore("cola", { keyPath: "id" }); if (!d.objectStoreNames.contains("cfg")) d.createObjectStore("cfg"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
function tx(store, mode, fn) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }

function subir() {
  return Promise.all([tx("cfg", "readonly", function (s) { return s.get("clave"); }), tx("cfg", "readonly", function (s) { return s.get("receptor"); }), tx("cola", "readonly", function (s) { return s.getAll(); })])
    .then(function (v) {
      var clave = v[0], url = v[1], p = (v[2] || []).filter(function (x) { return x.estado !== "subido"; });
      if (!clave || !url || url.indexOf("http") !== 0 || !p.length) return;
      return fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ k: clave, items: p.map(function (x) { return { id: x.id, creado: x.creado, fecha: x.fecha, monto: x.monto, categoria: x.categoria, necesidad: x.necesidad, medio: x.medio, cuenta: x.cuenta, descripcion: x.descripcion, notas: x.notas }; }) }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error("rechazado");
          var ids = j.ids || [], ahora = new Date().toISOString();
          return tx("cola", "readwrite", function (s) { p.forEach(function (x) { if (ids.indexOf(x.id) >= 0) { x.estado = "subido"; x.subido = ahora; s.put(x); } }); })
            .then(function () { return self.clients.matchAll(); })
            .then(function (cs) { cs.forEach(function (c) { c.postMessage("subidos"); }); });
        });
    });
}
/* Chrome en Android avisa aquí cuando vuelve la señal, aunque el anotador esté cerrado. */
self.addEventListener("sync", function (e) { if (e.tag === "subir-gastos") e.waitUntil(subir()); });
