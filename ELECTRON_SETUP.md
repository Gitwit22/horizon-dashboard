# Horizon Console — Electron Setup

This project is now configured to run as a standalone desktop application.

## Files Added

- `electron/main.js` — Window management and app initialization
- `electron/preload.js` — Security bridge between React and Electron
- `assets/icon.png` — Application icon (512x512 PNG)
- Updated `package.json` — Electron scripts and build config

## Development

### Run in Electron (with hot reload from Vite)

```bash
npm run dev:all
```

This starts both:
- Vite dev server (http://localhost:5173)
- Electron window (auto-loads Vite app)

Changes to React code hot-reload automatically in the Electron window.

### Build Standalone .exe

```bash
npm run build:electron:win
```

This creates:
- `dist/Horizon Console Setup.exe` — Installer (creates Start menu shortcuts, desktop icon)
- `dist/Horizon Console.exe` — Portable executable (no installation needed)

Copy the .exe to your desktop and click to run!

## Icon

Place your icon at: `assets/icon.png` (512x512 PNG)

Current placeholder will be used if not provided.

## Windows Integration

The installer creates:
- Desktop shortcut
- Start menu entry
- Uninstaller

Users can click the desktop icon to launch the app.

## Features

- ✅ Native window (not browser)
- ✅ Menu (File, View with reload/dev tools)
- ✅ IPC messaging from React to Electron
- ✅ Auto-dev-tools in dev mode
- ✅ Error handling

## Next Steps

1. **Build icon** (512x512 PNG) or use placeholder
2. **Test dev mode:** `npm run dev:all`
3. **Build executable:** `npm run build:electron:win`
4. **Test .exe** on your system
5. **Deploy** — copy .exe or run installer

## Notes

- The app loads React from Vite in dev mode
- In production build, it loads from dist/index.html
- Chat and all features work the same
- Network requests go to 10.0.0.194:3001 (Agent API)

---

**Ready to test!**
