# Afterimage

Audio-reactive visuals from any song, photo or album cover. It runs as a web app and as a desktop app for macOS, Windows and Linux, all from one codebase.

Drop in a track, a photo, a screenshot of your music player or a video. Screenshots are scanned for the album cover, and its colors become the palette. Transparent logos become an emblem that pulses with the beat.

## Features

- **17 scenes**: Limitless (your image with 22 effect modes), Ink, Fluid (real stable-fluids sim), Relic (Mandelbulb), Citadel (Mandelbox), Mandala, Descent, Gate, Spacetime, Anemone, Wisp (GPU particles), Synapse, Morphogen (reaction-diffusion you can paint), Sand (Chladni), Rings, Ridge (spectrogram terrain) and Signal (analyzer, waterfall, scope, goniometer, Lissajous).
- **Audio analysis**: bass, mid and high bands, kick and accent detection, live tempo, FFT, stereo waveform and a scrolling spectrogram. Sources are a track, mic or audio interface, computer audio (Spotify, YouTube, any app), video sound, or the built-in demo groove.
- **Big edits**: react, chaos, trails, heat and brightness. **Frame**: symmetry, tiles, twist, slice and spin. **Lens**: glass ribs, glass fan, anamorphic, melt, glitch, pixels and fly eye. Also hue drift and vignette.
- **24 palettes**, plus one taken from your image.
- **128 preset slots** with timed morphing, plus import and export.
- **Automation lanes**: arm it, play the track and move controls. Your moves replay on the next pass.
- **MIDI learn** for any control.
- **Recording** at 1080p, 1440p or 4K, 30 or 60 fps, in 16:9, 9:16 or 1:1, saved as MP4 with audio. PNG stills too.
- **Output window** for projectors and second screens.
- **Keyboard first**: press `?` in the app for the full list.

## Run it

```bash
npm install
npm run dev          # web app at http://localhost:5173
npm run build        # static site in dist/ (host anywhere: Vercel, Netlify, GitHub Pages)
npm run desktop      # desktop app from the build
npm run dist         # installers in release/ (dmg/zip on macOS, exe/zip on Windows, AppImage on Linux)
```

Pushing a tag like `v1.0.0` runs `.github/workflows/release.yml`. It builds installers for all three platforms and deploys the web app to GitHub Pages.

## Selling it (Pro)

The free tier includes every non-Pro scene and 1080p recording. Pro unlocks the 8 heavy scenes, 1440p and 4K recording, the output window and MIDI. Pro scenes give a 20-second preview, then show the unlock sheet.

Licenses are offline Ed25519 keys, so you don't need a server.

1. `npm run keygen` prints a keypair. Put the public key in `src/lib/license.ts` and keep the secret key private.
2. Set `VITE_BUY_URL` to your checkout link (a Stripe Payment Link, Lemon Squeezy or Gumroad) and `VITE_PRICE` to the price, e.g. `VITE_BUY_URL=https://buy.stripe.com/xxx VITE_PRICE='$24' npm run build`.
3. After a sale, run `AFTERIMAGE_SECRET=<secret> npm run sign buyer@email.com` and send the buyer the `AFTR-…` key. Lemon Squeezy and Gumroad can do this automatically with a small webhook that calls the same signing code.

## Notes

- Needs WebGL2 with float render targets. Every current desktop browser has this.
- MP4 recording needs Chrome/Edge 126+ or the desktop app. Other browsers save WebM.
- Computer audio: in the browser, pick a screen or tab and tick "Share audio". The desktop app captures it directly on Windows and on macOS 13+.
- The macOS build is unsigned. After unzipping, run `xattr -cr Afterimage.app` once, or right-click the app and choose Open. To ship to customers, sign and notarize it with an Apple Developer ID (`CSC_LINK`, `APPLE_ID` and related env vars in CI).

All scenes, shaders, palettes and artwork are original.
