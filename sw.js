// Service worker — app shell hors-ligne + installabilité PWA (voir intégration dans index.html).
// CACHE_VERSION à synchroniser avec APP_VERSION à chaque livraison qui touche l'app shell
// (index.html, manifest.json, icônes, ou la liste des CDN ci-dessous) : changer cette chaîne
// suffit à invalider l'ancien cache au prochain chargement (voir "activate" plus bas).
const CACHE_VERSION = "2026.9.13.18.30";
const CACHE_NAME = `pokedex-shell-${CACHE_VERSION}`;

// Ressources nécessaires au tout premier rendu de l'app, mises en cache dès l'installation du
// service worker. Chemins relatifs (jamais de "/" en tête) : le site est servi depuis un
// sous-chemin GitHub Pages (…/pokedex-home/), pas à la racine du domaine.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // active la nouvelle version dès l'installation, sans attendre la fermeture de tous les onglets ouverts
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Domaines volontairement jamais interceptés : la synchro Gist (api.github.com) doit toujours
// refléter l'état distant réel (jamais de réponse mise en cache silencieusement), et PokeAPI
// (pokeapi.co) est consultée à la demande — non nécessaire au fonctionnement hors-ligne du tracker.
const NEVER_CACHE_HOSTS = ["api.github.com", "pokeapi.co"];

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || NEVER_CACHE_HOSTS.includes(url.hostname)) return;

  // Cache d'abord (réponse immédiate si connue), puis revalidation réseau en arrière-plan pour
  // garder le cache à jour ; hors-ligne, la promesse réseau échoue et on retombe sur le cache.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
