import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, Apple, AppWindow, Cpu, HardDrive, Monitor, Power, RefreshCw, ShieldCheck, Terminal, Trash2, Zap } from "lucide-react";
import V86 from "v86";
import wasmUrl from "v86/build/v86.wasm?url";
import "./style.css";

const DB = "webvm-local", STORE = "machine";
const BIOS_ROOT = "https://cdn.jsdelivr.net/gh/copy/v86@master/";
const LINUX_IMAGE = "https://i.copy.sh/linux.iso";
const estimateRam = () => Math.min(2048, Math.max(256, Math.floor((navigator.deviceMemory || 4) * 256)));
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function read(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function write(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}
async function wipeDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}


const systems = [
  { id: "linux", name: "Linux", detail: "Lightweight Linux demo", state: "READY", icon: Terminal, available: true },
  { id: "windows", name: "Windows", detail: "Requires a separate VM backend", state: "UNAVAILABLE", icon: AppWindow, available: false },
  { id: "macos", name: "macOS", detail: "Not supported by browser emulator", state: "UNAVAILABLE", icon: Apple, available: false }
];

function App() {
  const display = useRef(null), emulator = useRef(null), timer = useRef(null);
  const [vm, setVm] = useState(null), [ram, setRam] = useState(estimateRam);
  const [selectedOS, setSelectedOS] = useState("linux");
  const [status, setStatus] = useState("stopped"), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Select Linux, then press Start machine.");
  const [logs, setLogs] = useState(["WebVM initialized.", "Built-in Linux is ready to launch."]);
  const [savedAt, setSavedAt] = useState(null), [confirmWipe, setConfirmWipe] = useState(false);

  const log = useCallback(message => setLogs(old => [...old.slice(-19), new Date().toLocaleTimeString() + "  " + message]), []);
  useEffect(() => {
    let active = true;
    read("machine").then(data => {
      if (!active || !data) return;
      setVm(data); setRam(data.ram || estimateRam()); setSelectedOS(data.os || "linux"); setSavedAt(data.savedAt || null);
      setNotice("Saved Linux snapshot found. Start Linux to restore it.");
      log("Found a saved browser session.");
    }).catch(error => setNotice("Browser storage error: " + error.message));
    return () => { active = false; };
  }, [log]);

  const saveSnapshot = useCallback(async () => {
    if (!emulator.current) return;
    try {
      const state = await emulator.current.save_state();
      const next = { ...(vm || {}), os: selectedOS, state, ram, savedAt: Date.now() };
      await write("machine", next); setVm(next); setSavedAt(next.savedAt);
      log("Session snapshot saved locally.");
    } catch (error) { log("Snapshot failed: " + (error?.message || error)); }
  }, [vm, selectedOS, ram, log]);

  useEffect(() => {
    if (status !== "running") return;
    timer.current = window.setInterval(saveSnapshot, 60000);
    return () => window.clearInterval(timer.current);
  }, [status, saveSnapshot]);

  const chooseOS = async id => {
    setSelectedOS(id);
    if (id !== "linux") {
      setNotice(id === "windows"
        ? "This emulator cannot run modern Windows. A separate virtualization server and licensed Windows image are required."
        : "macOS is not supported by v86. It cannot be launched inside this browser VM.");
      return;
    }
    const next = { ...(vm || {}), os: "linux", ram };
    setVm(next); await write("machine", next);
    setNotice("Linux selected. Press Start machine. The image downloads automatically.");
  };

  const stop = async (save = true) => {
    if (save) await saveSnapshot();
    try { emulator.current?.stop(); } catch {}
    emulator.current = null;
    if (display.current) display.current.replaceChildren();
    setStatus("stopped"); setBusy(false); log("Machine powered off.");
  };

  const start = async () => {
    if (selectedOS !== "linux" || busy || status === "running") return;
    setBusy(true); setStatus("starting"); setNotice("Loading emulator, BIOS and Linux image...");
    try {
      const instance = new V86({
        wasm_path: wasmUrl,
        memory_size: ram * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: display.current,
        bios: { url: BIOS_ROOT + "bios/seabios.bin" },
        vga_bios: { url: BIOS_ROOT + "bios/vgabios.bin" },
        cdrom: { url: LINUX_IMAGE },
        autostart: false,
        disable_speaker: true,
        uart1: true,
        acpi: true
      });
      emulator.current = instance;
      let readyHandled = false;
      instance.add_listener("emulator-ready", async () => {
        if (readyHandled) return;
        readyHandled = true;
        try {
          if (vm?.state && vm.os === "linux" && vm.ram === ram) {
            await instance.restore_state(vm.state);
            log("Restored saved Linux session.");
          } else {
            instance.run();
            log("Linux boot started from the built-in image.");
          }
          setStatus("running");
          setNotice("Linux is running. Click inside the display to use the keyboard and mouse.");
        } catch (error) {
          try { instance.stop(); } catch {}
          emulator.current = null; setStatus("error");
          setNotice("Linux failed to boot: " + (error?.message || error));
          log("Boot error: " + (error?.message || error));
        } finally { setBusy(false); }
      });
      instance.add_listener("download-error", error => {
        const message = error?.message || "A required emulator file could not be downloaded.";
        setNotice("Download failed: " + message); log("Download error: " + message);
        setStatus("error"); setBusy(false);
      });
    } catch (error) {
      emulator.current = null; setStatus("error");
      setNotice(error?.message || "Could not initialize the emulator.");
      log("Startup error: " + (error?.message || error)); setBusy(false);
    }
  };

  const restart = async () => {
    if (!emulator.current || busy) return;
    setBusy(true);
    try { emulator.current.stop(); } catch {}
    emulator.current = null;
    if (display.current) display.current.replaceChildren();
    setStatus("stopped"); setBusy(false);
    await start();
  };

  const setMemory = async value => {
    const nextRam = Number(value); setRam(nextRam);
    const next = { ...(vm || {}), os: selectedOS, ram: nextRam, state: null };
    setVm(next); await write("machine", next);
    setNotice("RAM setting saved. It applies on the next boot.");
  };

  const erase = async () => {
    await stop(false); await wipeDB(); setVm(null); setSavedAt(null); setStatus("stopped"); setSelectedOS("linux");
    setNotice("Saved WebVM data erased from this browser."); setLogs(["WebVM initialized.", "Local data wiped."]);
    setConfirmWipe(false);
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Monitor size={17}/></span><strong>web<span>vm</span></strong><small>BETA</small></div>
      <div className="top-center">BROWSER VIRTUALIZATION <span>/</span> WORKSPACE</div>
      <div className="top-right"><i className={status === "running" ? "live" : ""}/>{status === "running" ? "RUNNING" : status === "starting" ? "STARTING" : status === "error" ? "ERROR" : "LOCAL SESSION"}</div>
    </header>

    <main className="workspace">
      <section className="intro">
        <div><label>YOUR BROWSER VM</label><h1>Choose an operating system</h1><p>Launch a built-in system without uploading an ISO.</p></div>
        <div className="local-tag"><ShieldCheck size={15}/> Runs in your browser</div>
      </section>

      <section className="os-picker" aria-label="Operating systems">
        {systems.map(os => { const Icon = os.icon; return <button key={os.id} className={"os-tile " + (selectedOS === os.id ? "chosen" : "") + (!os.available ? " locked" : "")} onClick={() => chooseOS(os.id)}>
          <span className={"tile-icon " + os.id}><Icon size={22}/></span>
          <span className="tile-copy"><b>{os.name}</b><small>{os.detail}</small></span>
          <span className={"tile-state " + (os.available ? "available" : "")}>{os.state}</span>
        </button>; })}
      </section>

      <section className="console-card">
        <div className="console-head">
          <div className="console-title"><span className="console-symbol"><Terminal size={17}/></span><div><b>{selectedOS === "linux" ? "Linux virtual machine" : selectedOS === "windows" ? "Windows virtual machine" : "macOS virtual machine"}</b><small>{selectedOS === "linux" ? "v86 x86 emulator · Built-in boot image" : "Not supported by the current emulator"}</small></div></div>
          <div className="console-actions">
            <button className="action-button" onClick={() => stop(true)} disabled={status !== "running" || busy}><Power size={14}/> Shut down</button>
            <button className="action-button" onClick={restart} disabled={status !== "running" || busy}><RefreshCw size={14}/> Restart</button>
            <button className="action-button primary-action" onClick={status === "running" ? () => stop(true) : start} disabled={busy || (selectedOS !== "linux" && status !== "running")}><Zap size={14}/>{busy ? "Starting..." : status === "running" ? "Stop machine" : "Start machine"}</button>
          </div>
        </div>
        <div className="screen-wrap">
          <div className="screen-caption"><span><i className={status === "running" ? "live" : ""}/>{status === "running" ? "DISPLAY CONNECTED" : status === "starting" ? "INITIALIZING" : "VM DISPLAY"}</span><span>CLICK SCREEN TO CAPTURE INPUT</span></div>
          <div className="screen" ref={display}>
            <div className="screen-placeholder"><div className="placeholder-icon"><Monitor size={27}/></div><b>{status === "starting" ? "Starting Linux..." : status === "running" ? "Preparing display..." : "Your virtual machine is off"}</b><span>{selectedOS === "linux" ? "Press Start machine to boot the built-in Linux image." : "Select Linux to launch a supported system."}</span></div>
          </div>
        </div>
        <div className="console-foot"><span><Activity size={14}/>{notice}</span>{savedAt && <small>LAST SAVED {new Date(savedAt).toLocaleTimeString()}</small>}</div>
      </section>

      <section className="bottom-grid">
        <div className="settings-card">
          <div className="section-heading"><div><b>Machine resources</b><small>Configure the browser emulator</small></div><span className="auto-pill">AUTO CONFIG</span></div>
          <div className="resource-row"><span className="resource-icon"><Cpu size={16}/></span><div className="resource-copy"><b>Memory allocation</b><small>Estimated device memory: {navigator.deviceMemory || "?"} GB</small></div><select value={ram} disabled={status === "running" || busy} onChange={e => setMemory(e.target.value)}><option value="256">256 MB</option><option value="512">512 MB</option><option value="768">768 MB</option><option value="1024">1 GB</option><option value="1536">1.5 GB</option><option value="2048">2 GB</option></select></div>
          <div className="resource-row"><span className="resource-icon"><HardDrive size={16}/></span><div className="resource-copy"><b>System image</b><small>Linux demo image · downloaded on demand</small></div><span className="resource-value">ONLINE</span></div>
        </div>
        <div className="info-card">
          <div className="section-heading"><div><b>Session information</b><small>Local browser storage</small></div><span className="secure-pill"><ShieldCheck size={12}/> PRIVATE</span></div>
          <p>Snapshots are saved in this browser when possible. Keep this tab open while Linux runs. Browser storage is not a full virtual hard drive.</p>
          <button className="wipe-button" onClick={() => setConfirmWipe(true)} disabled={busy}><Trash2 size={13}/> Clear saved session</button>
        </div>
      </section>
      <footer>Linux is a lightweight demo environment. Current Windows and macOS releases are not supported by this emulator.</footer>
    </main>

    {confirmWipe && <div className="modal-backdrop"><div className="modal"><span className="modal-icon"><AlertTriangle size={21}/></span><h2>Clear saved session?</h2><p>This removes WebVM's saved snapshot and settings from this browser.</p><div className="modal-actions"><button className="action-button" onClick={() => setConfirmWipe(false)}>Cancel</button><button className="action-button primary-action" onClick={erase}><Trash2 size={13}/> Clear data</button></div></div></div>}
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
