# WebVM

A browser-based x86 emulator interface powered by [v86](https://github.com/copy/v86).

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Built-in systems

- Linux: a lightweight 32-bit x86 Linux demo image loads automatically from `https://i.copy.sh/linux.iso`.
- Modern Windows and macOS are not supported by v86. They require a different virtualization architecture and, for Windows/macOS, appropriate licensed system software.

## Emulator assets

The app loads `libv86.js` and `v86.wasm` from the v86 `build/` directory. SeaBIOS and VGA BIOS are loaded from the repository's `bios/` directory. The Linux demo image is hosted by the v86 project. These assets require internet access.

## Limitations

v86 is a lightweight x86 emulator, not full hardware virtualization. It supports 32-bit guest systems. The built-in Linux image is a demo image, not a modern Ubuntu desktop. Browser tabs can be suspended or terminated. IndexedDB snapshots are best-effort and do not provide a persistent writable virtual hard drive.

Wiping WebVM removes only this app's local browser data. A browser emulator is not a guaranteed security boundary. Do not use it to open malware on a device containing sensitive data.
