# RANKLAB

A browser-based video ranking editor for YouTube Shorts, TikTok, Instagram Reels, and other formats.

## Features

- Import and reorder local video clips.
- Trim clips and customize the canvas, titles, labels, and ranking numbers.
- Add background music and control soundtrack volume.
- Preserve source clip audio and mix it with background music.
- Apply crossfade transitions between clips.
- Export MP4 (H.264 video + AAC audio) locally with FFmpeg.wasm.
- Download project settings as JSON. Media stays on your device.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## MP4 export

The first export downloads the FFmpeg WebAssembly core from unpkg, so an internet connection is required for the first load. Rendering is performed locally in your browser and can be memory-intensive. Use a recent desktop version of Chrome or Edge for best results.

## Deploy

The repository includes a GitHub Actions workflow to build and deploy the `dist` directory to GitHub Pages.

## Privacy

Imported media is processed locally in the browser and is not uploaded to a server.
