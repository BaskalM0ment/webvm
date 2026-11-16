import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, Cpu, HardDrive, Info, Monitor, Power, RefreshCw, ShieldCheck, Trash2, Zap, Apple, AppWindow, Terminal } from "lucide-react";
import "./style.css";

const DB = "webvm-local", STORE = "machine";
const CDN = "https://cdn.jsdelivr.net/gh/copy/v86@master/build/";
const LINUX_IMAGE = "https://i.copy.sh/linux.iso";
const estimateRam = () => Math.min(2048, Math.max(256, Math.floor((navigator.deviceMemory || 4) * 1024 * .25)));
const prettySize = n => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
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
function loadV86() {
  if (window.V86Starter) return Promise.resolve();
  if (window.v86Promise) return window.v86Promise;
  window.v86Promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CDN + "libv86.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the emulator. Check your internet connection."));
    document.head.appendChild(script);
  });
  return window.v86Promise;
}

const systems = [
  { id: "linux", name: "Linux", detail: "Boot a lightweight Linux system", state: "READY", icon: Terminal, available: true },
  { id: "windows", name: "Windows", detail: "Modern Windows needs a separate VM host", state: "NOT AVAILABLE", icon: AppWindow, available: false },
  { id: "macos", name: "macOS", detail: "macOS cannot run in this browser emulator", state: "NOT AVAILABLE", icon: Apple, available: false }
];

function App() {
  const display = useRef(null), emulator = useRef(null), timer = useRef(null);
  const [vm, setVm] = useState(null), [ram, setRam] = useState(estimateRam);
  const [selectedOS, setSelectedOS] = useState("linux");
  const [status, setStatus] = useState("stopped"), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Choose Linux to start a built-in operating system. No ISO upload is needed.");
  const [logs, setLogs] = useState(["WebVM ready.", "Built-in Linux is available."]);
  const [savedAt, setSavedAt] = useState(null), [confirmWipe, setConfirmWipe] = useState(false);

  const log = useCallback(s => setLogs(old => [...old.slice(-59), new Date().toLocaleTimeString() + "  " + s]), []);
  useEffect(() => {
    let alive = true;
    read("machine").then(data => {
      if (!alive || !data) return;
      setVm(data); setRam(data.ram || estimateRam()); setSelectedOS(data.os || "linux"); setSavedAt(data.savedAt || null);
      setNotice("Saved Linux session found. Start Linux to try restoring its last snapshot.");
      log("Loaded saved VM state from this browser.");
    }).catch(e => setNotice("Local storage error: " + e.message));
    return () => { alive = false; };
  }, [log]);

  const saveSnapshot = useCallback(async () => {
    if (!emulator.current) return;
    try {
      const state = await new Promise((resolve, reject) => emulator.current.save_state((err, value) => err ? reject(err) : resolve(value)));
      const next = { ...(vm || {}), os: selectedOS, state, ram, savedAt: Date.now() };
      await write("machine", next); setVm(next); setSavedAt(next.savedAt); log("Linux session snapshot saved in this browser.");
    } catch (e) { log("Snapshot failed: " + (e?.message || e)); }
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
        ? "Modern Windows cannot boot in WebVM's lightweight x86 browser emulator. A separate Windows virtualization server and a licensed Windows image would be required."
        : "macOS cannot run in this browser emulator. Apple hardware and licensing restrictions also apply.");
      return;
    }
    const next = { ...(vm || {}), os: "linux", ram };
    setVm(next);
    await write("machine", next);
    setNotice("Linux selected. Click Start machine. The system image downloads automatically on first boot.");
    log("Selected built-in Linux.");
  };

  const stop = async (save = true) => {
    if (save) await saveSnapshot();
    try { emulator.current?.stop(); } catch {}
    emulator.current = null;
    if (display.current) display.current.replaceChildren();
    setStatus("stopped"); log("Virtual machine stopped.");
  };

  const start = async () => {
    if (selectedOS !== "linux") {
      setNotice("Only the built-in Linux environment is supported by this browser emulator.");
      return;
    }
    setBusy(true); setNotice("Loading the emulator and built-in Linux image...");
    try {
      await loadV86();
      const instance = new window.V86Starter({
        wasm_path: CDN + "v86.wasm",
        memory_size: ram * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: display.current,
        bios: { url: CDN + "seabios.bin" },
        vga_bios: { url: CDN + "vgabios.bin" },
        cdrom: { url: LINUX_IMAGE },
        autostart: false, uart1: true, acpi: true
      });
      emulator.current = instance;
      instance.add_listener("emulator-ready", async () => {
        try {
          if (vm?.state && vm.os === "linux" && vm.ram === ram) {
            await instance.restore_state(vm.state);
            log("Restored the previous Linux snapshot.");
          } else {
            instance.run();
            log("Booted built-in Linux image.");
          }
          setStatus("running"); setNotice("Linux is running. The first boot may take a little time. Click the display to use it.");
        } catch (e) {
          setStatus("error"); setNotice("Linux could not start: " + (e?.message || e));
          log("Boot failed: " + (e?.message || e));
        } finally { setBusy(false); }
      });
    } catch (e) {
      emulator.current = null; setStatus("error"); setNotice(e?.message || "Could not start emulator.");
      log("Start failed: " + (e?.message || e)); setBusy(false);
    }
  };

  const restart = async () => {
    if (!emulator.current) return;
    setBusy(true); await saveSnapshot();
    try { emulator.current.stop(); } catch {}
    emulator.current = null; if (display.current) display.current.replaceChildren();
    setStatus("stopped"); setBusy(false); await start();
  };

  const setMemory = async value => {
    const nextRam = Number(value); setRam(nextRam);
    const next = { ...(vm || {}), os: selectedOS, ram: nextRam, state: null };
    setVm(next); await write("machine", next);
    setNotice("RAM setting saved. Start the machine again to apply it.");
    log("RAM allocation set to " + nextRam + " MB.");
  };

  const erase = async () => {
    await stop(false); await wipeDB(); setVm(null); setSavedAt(null); setStatus("stopped"); setSelectedOS("linux");
    setNotice("Saved WebVM session data has been erased from this browser."); setLogs(["WebVM ready.", "Local VM data wiped."]);
    setConfirmWipe(false);
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Monitor size={19}/></div><span>web<span>vm</span></span><small>BETA</small></div>
      <div className="nav-caption">WORKSPACE</div><div className="nav active"><Monitor size={16}/> Operating systems</div><div className="nav disabled"><HardDrive size={16}/> Storage</div>
      <div className="side-bottom"><div className="local-card"><ShieldCheck size={18}/><div><b>Local-first</b><span>Your VM session stays in this browser.</span></div></div><div className="user-card"><div className="avatar">W</div><div><b>WebVM session</b><span>Browser workspace</span></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div>Workspace <span>/</span> <b>Operating systems</b></div><div className="top-status"><i/> Local storage enabled <em>W</em></div></header>
      <div className="content">
        <div className="heading"><div><label>VIRTUALIZATION WORKSPACE</label><h1>Choose your operating system</h1><p>Start a built-in system directly in your browser. No ISO upload required.</p></div><div className="status"><i className={status === "running" ? "on" : ""}/>{status === "running" ? "Running" : status === "error" ? "Error" : "Powered off"}</div></div>
        <section className="os-grid">
          {systems.map(os => { const Icon = os.icon; return <button key={os.id} className={"os-card " + (selectedOS === os.id ? "selected" : "") + (!os.available ? " unavailable" : "")} onClick={() => chooseOS(os.id)}>
            <div className="os-card-top"><div className={"os-brand-icon " + os.id}><Icon size={23}/></div><span className={os.available ? "ready" : "not-ready"}>{os.state}</span></div>
            <b>{os.name}</b><span>{os.detail}</span>
            <small>{os.available ? (selectedOS === os.id ? "SELECTED" : "CLICK TO SELECT") : "REQUIRES DIFFERENT EMULATOR"}</small>
          </button>; })}
        </section>
        <section className="machine card">
          <div className="machine-head"><div className="machine-name"><div className="os-icon"><Terminal size={19}/></div><div><b>{selectedOS === "linux" ? "Built-in Linux" : selectedOS === "windows" ? "Windows" : "macOS"}</b><span>{selectedOS === "linux" ? "Linux image hosted by the v86 project" : "Not supported by the current browser emulator"}</span></div></div><div className="actions">
            <button className="button subtle" onClick={() => stop(true)} disabled={status !== "running" || busy}><Power size={14}/> Shut down</button>
            <button className="button subtle" onClick={restart} disabled={status !== "running" || busy}><RefreshCw size={14}/> Restart</button>
            <button className="button primary" onClick={status === "running" ? () => stop(true) : start} disabled={busy || (selectedOS !== "linux" && status !== "running")}>{busy ? <span className="spinner"/> : status === "running" ? <Power size={14}/> : <Zap size={14}/>} {busy ? "Working..." : status === "running" ? "Stop machine" : "Start machine"}</button>
          </div></div>
          <div className="screen-frame"><div className="screen-bar"><div className="lights"><i/><i/><i/></div>VM CONSOLE <span>VGA DISPLAY</span></div><div className="screen" ref={display}><div className="screen-empty"><div><Monitor size={29}/></div><b>{status === "running" ? "Initializing display..." : "Your machine is powered off"}</b><span>{selectedOS === "linux" ? "Select Start machine to boot Linux." : "Choose Linux to run an operating system in this browser."}</span></div></div><div className="screen-foot"><span><i className={status === "running" ? "on" : ""}/>{status === "running" ? "Connected to emulator" : "No active session"}</span><span>Click display to capture input</span></div></div>
          <div className="machine-notice"><span><Activity size={14}/>{notice}</span>{savedAt && <small>Saved {new Date(savedAt).toLocaleString()}</small>}</div>
        </section>
        <div className="columns">
          <section className="card panel"><div className="panel-title"><div><h2>Machine configuration</h2><p>Resources allocated to this VM.</p></div><small><Zap size={11}/> AUTO DETECTED</small></div>
            <div className="setting"><div className="setting-icon"><Cpu size={16}/></div><div><b>Memory (RAM)</b><span>Estimated host memory: {navigator.deviceMemory || "Unknown"} GB</span></div><select value={ram} disabled={status === "running"} onChange={e => setMemory(e.target.value)}><option value="256">256 MB</option><option value="512">512 MB</option><option value="1024">1 GB</option><option value="1536">1.5 GB</option><option value="2048">2 GB</option></select></div>
            <div className="setting"><div className="setting-icon"><Monitor size={16}/></div><div><b>Video memory</b><span>Emulated VGA memory</span></div><strong>8 MB</strong></div>
            <div className="setting"><div className="setting-icon"><HardDrive size={16}/></div><div><b>System image</b><span>Downloaded directly from the v86 image host</span></div><strong>Linux</strong></div>
            <div className="hint"><Info size={14}/> WebVM uses a lightweight 32-bit x86 emulator. It cannot run current Windows or macOS.</div>
          </section>
          <section className="card panel"><div className="panel-title"><div><h2>Built-in system</h2><p>No file upload or manual setup.</p></div><div className="upload-icon"><ShieldCheck size={16}/></div></div>
            <div className="builtin-card"><div className="builtin-symbol"><Terminal size={22}/></div><div><b>Linux boot image</b><span>Hosted by the v86 project. Loaded on demand when you press Start.</span></div><span className="ready">READY</span></div>
            <div className="warning"><AlertTriangle size={14}/> Windows and macOS require a different virtualization setup. They are not silently replaced with lookalike systems.</div>
          </section>
        </div>
        <section className="card logs"><div className="panel-title"><div><h2>Activity log</h2><p>Recent virtual machine events.</p></div><button className="clear" onClick={() => setLogs([])}>Clear log</button></div><div className="log-list">{logs.slice(-6).reverse().map((line,i)=><div key={i}><i/><code>{line}</code></div>)}</div></section>
        <section className="danger"><div><div className="danger-icon"><Trash2 size={17}/></div><div><b>Wipe virtual machine</b><span>Erase the saved Linux snapshot and local configuration.</span></div></div><button className="button danger-button" onClick={() => setConfirmWipe(true)}><Trash2 size={14}/> Wipe all data</button></section>
        <footer>WebVM uses the open-source v86 x86 emulator. Linux system files load from the v86 image host. Browser storage can be cleared by browser settings.</footer>
      </div>
    </main>
    {confirmWipe && <div className="modal-backdrop"><div className="modal"><div className="modal-warning"><AlertTriangle size={22}/></div><h2>Erase this virtual machine?</h2><p>This deletes the saved Linux snapshot and WebVM settings from this browser. It cannot be undone.</p><div><button className="button subtle" onClick={() => setConfirmWipe(false)}>Cancel</button><button className="button danger-button" onClick={erase}>Erase everything</button></div></div></div>}
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
