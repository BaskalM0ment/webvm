# WebVM

A browser-based x86 emulator interface powered by [v86](https://github.com/copy/v86).

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Built-in operating systems

- Linux: starts a lightweight Linux image hosted by the v86 project. No ISO upload is required.
- Windows: current Windows releases are not supported by v86. A separate virtualization backend and a properly licensed Windows image are required.
- macOS: macOS is not supported by this browser emulator. Apple hardware and licensing requirements also apply.

The Linux image downloads from `https://i.copy.sh/linux.iso` when the user starts the VM. The emulator runtime and BIOS files load from jsDelivr. An internet connection is required.

## Limitations

WebVM uses v86, a lightweight x86 emulator. It does not provide full hardware virtualization, and it cannot run modern 64-bit Windows or macOS. Linux compatibility depends on the image and the browser. The included Linux image is a small demo image, not a full Ubuntu desktop.

RAM settings are estimates. Browser tabs can be suspended or terminated. Snapshot save and restore uses IndexedDB and is best-effort. It is not a substitute for a persistent virtual hard drive.

Wiping WebVM deletes only this application's IndexedDB data. It does not scan or disinfect the host computer. A browser emulator is not a guaranteed security boundary. Do not use it to open malware on a device containing sensitive data.

Add a license before distributing this project.
