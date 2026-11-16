# WebVM

A local-first browser interface for running compatible x86 operating systems with [v86](https://github.com/copy/v86).

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Features

- Upload bootable ISO, IMG, BIN and floppy images.
- Run a v86 x86 emulator in the browser.
- Select a conservative RAM allocation based on the browser device-memory estimate.
- Store boot media and VM snapshots in IndexedDB.
- Start, stop, restart, and wipe the local VM.
- Download the stored boot image.

## Compatibility

This uses x86 emulation, not general-purpose hardware virtualization. It supports compatible x86 systems, including some small Linux distributions and older operating systems. Modern Windows releases and macOS are generally not supported. Uploading a file does not guarantee that it will boot.

Browsers do not expose exact free RAM. The RAM recommendation uses `navigator.deviceMemory` when available and is only an estimate. Browser tabs can be suspended or terminated. Use Stop machine before leaving to request a final snapshot. Browser storage can be cleared by browser settings or storage pressure.

Wiping WebVM deletes only this application's IndexedDB data. It does not scan or disinfect the host computer. A browser emulator is not a guaranteed security boundary. Do not use it to open malware on a device containing sensitive data.

The v86 runtime and BIOS assets load from jsDelivr. An internet connection is required.

Add a license before distributing this project.
