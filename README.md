# CardTrack Shop

Public buy page + offline PWA for **CardTrack Shop License** ($59 one-time).

## Live URLs

- Buy / marketing: https://halthinks.github.io/cardtrack-shop/
- **App (offline PWA):** https://halthinks.github.io/cardtrack-shop/app/
- Checkout: Stripe **TEST** Payment Link (card `4242…`) — live mode is intentionally off
- App source stays private: https://github.com/halthinks/cardtrack

## Offline PWA

1. Open https://halthinks.github.io/cardtrack-shop/app/ once online (HTTPS).
2. Allow the service worker / Add to Home Screen.
3. Airplane mode: app shell loads from cache. Pokémon TCG images work if previously cached.

`file://` does not register service workers — use the Pages URL or `python3 -m http.server` locally.

## Hosting

GitHub Pages: Settings → Pages → Deploy from branch → `main` / `/ (root)`.

- Root `index.html` — buy/marketing page (CTA links to `./app/`)
- `app/` — Meet OS offline PWA (`index.html`, `assets/`, `sw.js`, `manifest.webmanifest`, icons)

Buyers can also receive a private zip after payment. Stripe live checkout is not enabled.
