# BF Presenter (Electron Builder Portable)

This version adds **electron-builder** so you can produce a **portable EXE** (runs from USB, no install) or a standard installer.

## Build (on your dev PC)
1. Install Node.js 18+
2. In this folder:
   ```bash
   npm install
   npm run dist:win:portable   # makes BFPresenter-Portable-*.exe
   # or
   npm run dist:win:x64        # makes an installer (NSIS)
   ```

## Portable user data
We set `app.setPath('userData', ./userdata)` so settings live beside the EXE (true portable mode).

## Run for development
```
npm start
```

## Controls
- Add Media → select MP3/MP4/JPG/PNG
- Space = Play/Pause, →/← = Next/Prev, B = Black, U = Un-black

> Tip: Build Windows targets on Windows for best results.
