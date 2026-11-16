import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, ArrowDownToLine, Cpu, HardDrive, Info, Monitor, Power, RefreshCw, ShieldCheck, Trash2, Upload, Zap } from "lucide-react";
import "./style.css";

const DB = "webvm-local", STORE = "machine";
const CDN = "https://cdn.jsdelivr.net/gh/copy/v86@master/build/";
const estimateRam = () => Math.min(2048, Math.max(256, Math.floor((navigator.deviceMemory || 4) * 1024 * .35)));
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
    script.onerror = () => reject(new Error("Could not load v86. Check your internet connection."));
    document.head.appendChild(script);
  });
  return window.v86Promise;
}

function App() {
  const display = useRef(null), emulator = useRef(null), timer = useRef(null);
  const [vm, setVm] = useState(null), [ram, setRam] = useState(estimateRam);
  const [status, setStatus] = useState("stopped"), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Upload a bootable image to create your virtual machine.");
  const [logs, setLogs] = useState(["WebVM ready.", "Local browser storage is enabled."]);
  const [savedAt, setSavedAt] = useState(null), [confirmWipe, setConfirmWipe] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const log = useCallback(s => setLogs(old => [...old.slice(-59), new Date().toLocaleTimeString() + "  " + s]), []);
  useEffect(() => {
    let alive = true;
    read("machine").then(data => {
      if (!alive || !data) return;
      setVm(data); setRam(data.ram || estimateRam()); setSavedAt(data.savedAt || null);
      setNotice("Saved machine found. Start it to resume your last snapshot.");
      log("Loaded saved VM from this browser.");
    }).catch(e => setNotice("Local storage error: " + e.message));
    return () => { alive = false; };
  }, [log]);

  const saveSnapshot = useCallback(async () => {
    if (!emulator.current || !vm) return;
    try {
      const state = await new Promise((resolve, reject) => emulator.current.save_state((err, value) => err ? reject(err) : resolve(value)));
      const next = { ...vm, state, ram, savedAt: Date.now() };
      await write("machine", next); setVm(next); setSavedAt(next.savedAt); log("VM snapshot saved in this browser.");
    } catch (e) { log("Snapshot failed: " + (e?.message || e)); }
  }, [vm, ram, log]);

  useEffect(() => {
    if (status !== "running") return;
    timer.current = window.setInterval(saveSnapshot, 60000);
    return () => window.clearInterval(timer.current);
  }, [status, saveSnapshot]);

  const upload = async file => {
    if (!file) return;
    if (!/\.(iso|img|bin|flp|ima)$/i.test(file.name)) {
      setNotice("Unsupported file type. Choose a bootable .iso, .img, .bin or floppy image."); return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) { setNotice("File exceeds the 2 GB upload limit."); return; }
    setBusy(true); setNotice("Reading and saving " + file.name + "...");
    try {
      const media = { name: file.name, size: file.size, buffer: await file.arrayBuffer() };
      const next = { media, ram, state: null, savedAt: Date.now() };
      await write("machine", next); setVm(next); setSavedAt(next.savedAt);
      setNotice("Boot image saved locally. Start the machine when ready."); log("Uploaded " + file.name + " (" + prettySize(file.size) + ").");
    } catch (e) { setNotice("Could not save file: " + e.message); }
    finally { setBusy(false); setInputKey(k => k + 1); }
  };

  const stop = async (save = true) => {
    if (save) await saveSnapshot();
    try { emulator.current?.stop(); } catch {}
    emulator.current = null;
    if (display.current) display.current.replaceChildren();
    setStatus("stopped"); log("Virtual machine stopped.");
  };

  const start = async () => {
    if (!vm?.media?.buffer) { setNotice("Upload a bootable ISO or disk image first."); return; }
    setBusy(true); setNotice("Loading the x86 emulator...");
    try {
      await loadV86();
      const instance = new window.V86Starter({
        wasm_path: CDN + "v86.wasm",
        memory_size: ram * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        screen_container: display.current,
        bios: { url: CDN + "seabios.bin" },
        vga_bios: { url: CDN + "vgabios.bin" },
        cdrom: { buffer: vm.media.buffer },
        autostart: false, uart1: true, acpi: true
      });
      emulator.current = instance;
      instance.add_listener("emulator-ready", () => {
        try {
          if (vm.state) { instance.restore_state(vm.state); log("Restored previous VM snapshot."); }
          else { instance.run(); log("Booted from uploaded image."); }
          setStatus("running"); setNotice("Machine is running. Click the display to use its keyboard and mouse.");
        } catch (e) { setStatus("error"); setNotice("VM restore failed: " + e.message); }
        setBusy(false);
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
    if (vm) {
      const next = { ...vm, ram: nextRam, state: null };
      setVm(next); await write("machine", next);
      setNotice("RAM setting saved. The previous snapshot was cleared because the memory size changed.");
      log("RAM allocation set to " + nextRam + " MB.");
    }
  };

  const erase = async () => {
    await stop(false); await wipeDB(); setVm(null); setSavedAt(null); setStatus("stopped");
    setNotice("All WebVM data in this browser has been erased."); setLogs(["WebVM ready.", "Local VM data wiped."]);
    setConfirmWipe(false); setInputKey(k => k + 1);
  };

  const downloadImage = () => {
    if (!vm?.media?.buffer) return;
    const url = URL.createObjectURL(new Blob([vm.media.buffer]));
    const a = document.createElement("a"); a.href = url; a.download = vm.media.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Monitor size={19}/></div><span>web<span>vm</span></span><small>BETA</small></div>
      <div className="nav-caption">WORKSPACE</div><div className="nav active"><Monitor size={16}/> Virtual machine</div><div className="nav disabled"><HardDrive size={16}/> Storage</div>
      <div className="side-bottom"><div className="local-card"><ShieldCheck size={18}/><div><b>Local-first</b><span>Your VM data stays in this browser.</span></div></div><div className="user-card"><div className="avatar">W</div><div><b>WebVM session</b><span>Browser workspace</span></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div>Workspace <span>/</span> <b>Virtual machine</b></div><div className="top-status"><i/> Local storage enabled <em>W</em></div></header>
      <div className="content">
        <div className="heading"><div><label>VIRTUALIZATION WORKSPACE</label><h1>Your virtual machine</h1><p>Boot a compatible operating system in your browser.</p></div><div className="status"><i className={status === "running" ? "on" : ""}/>{status === "running" ? "Running" : status === "error" ? "Error" : "Powered off"}</div></div>
        <section className="machine card">
          <div className="machine-head"><div className="machine-name"><div className="os-icon"><Monitor size={19}/></div><div><b>{vm?.media?.name || "New virtual machine"}</b><span>{vm?.media ? prettySize(vm.media.size) + " boot image" : "No boot media configured"}</span></div></div><div className="actions">
            <button className="button subtle" onClick={() => stop(true)} disabled={status !== "running" || busy}><Power size={14}/> Shut down</button>
            <button className="button subtle" onClick={restart} disabled={status !== "running" || busy}><RefreshCw size={14}/> Restart</button>
            <button className="button primary" onClick={status === "running" ? () => stop(true) : start} disabled={busy || (!vm?.media && status !== "running")}>{busy ? <span className="spinner"/> : status === "running" ? <Power size={14}/> : <Zap size={14}/>} {busy ? "Working..." : status === "running" ? "Stop machine" : "Start machine"}</button>
          </div></div>
          <div className="screen-frame"><div className="screen-bar"><div className="lights"><i/><i/><i/></div>VM CONSOLE <span>VGA DISPLAY</span></div><div className="screen" ref={display}><div className="screen-empty"><div><Monitor size={29}/></div><b>{status === "running" ? "Initializing display..." : "Your machine is powered off"}</b><span>{vm?.media ? "Press Start machine to boot your uploaded image." : "Upload a bootable ISO or disk image to get started."}</span></div></div><div className="screen-foot"><span><i className={status === "running" ? "on" : ""}/>{status === "running" ? "Connected to emulator" : "No active session"}</span><span>Click display to capture input</span></div></div>
          <div className="machine-notice"><span><Activity size={14}/>{notice}</span>{savedAt && <small>Saved {new Date(savedAt).toLocaleString()}</small>}</div>
        </section>
        <div className="columns">
          <section className="card panel"><div className="panel-title"><div><h2>Machine configuration</h2><p>Resources allocated to this VM.</p></div><small><Zap size={11}/> AUTO DETECTED</small></div>
            <div className="setting"><div className="setting-icon"><Cpu size={16}/></div><div><b>Memory (RAM)</b><span>Estimated host memory: {navigator.deviceMemory || "Unknown"} GB</span></div><select value={ram} disabled={status === "running"} onChange={e => setMemory(e.target.value)}><option value="256">256 MB</option><option value="512">512 MB</option><option value="1024">1 GB</option><option value="1536">1.5 GB</option><option value="2048">2 GB</option></select></div>
            <div className="setting"><div className="setting-icon"><Monitor size={16}/></div><div><b>Video memory</b><span>Emulated VGA memory</span></div><strong>8 MB</strong></div>
            <div className="setting"><div className="setting-icon"><HardDrive size={16}/></div><div><b>Persistent storage</b><span>Browser IndexedDB</span></div><strong>{vm?.media ? prettySize(vm.media.size) : "Not configured"}</strong></div>
            <div className="hint"><Info size={14}/> Browsers do not expose exact free RAM. WebVM uses a conservative estimate.</div>
          </section>
          <section className="card panel"><div className="panel-title"><div><h2>Boot media</h2><p>Choose an operating system image.</p></div><div className="upload-icon"><Upload size={16}/></div></div>
            <label className="dropzone"><input key={inputKey} type="file" accept=".iso,.img,.bin,.flp,.ima,application/octet-stream" onChange={e => upload(e.target.files?.[0])}/><Upload size={20}/><b>{vm?.media ? "Replace boot image" : "Click to upload a boot image"}</b><span>ISO, IMG, BIN or floppy image, up to 2 GB</span></label>
            {vm?.media && <div className="file-row"><div className="file-icon">IMG</div><div><b>{vm.media.name}</b><span>{prettySize(vm.media.size)} · Stored on this device</span></div><button title="Download image" onClick={downloadImage}><ArrowDownToLine size={16}/></button></div>}
            <div className="warning"><AlertTriangle size={14}/> Compatible x86 images only. Most modern Windows and macOS installers are unsupported.</div>
          </section>
        </div>
        <section className="card logs"><div className="panel-title"><div><h2>Activity log</h2><p>Recent virtual machine events.</p></div><button className="clear" onClick={() => setLogs([])}>Clear log</button></div><div className="log-list">{logs.slice(-6).reverse().map((line,i)=><div key={i}><i/><code>{line}</code></div>)}</div></section>
        <section className="danger"><div><div className="danger-icon"><Trash2 size={17}/></div><div><b>Wipe virtual machine</b><span>Permanently erase the saved image, VM snapshot and local configuration.</span></div></div><button className="button danger-button" onClick={() => setConfirmWipe(true)}><Trash2 size={14}/> Wipe all data</button></section>
        <footer>WebVM runs in your browser. Emulator assets load from a public CDN. Use operating system images you are licensed to use.</footer>
      </div>
    </main>
    {confirmWipe && <div className="modal-backdrop"><div className="modal"><div className="modal-warning"><AlertTriangle size={22}/></div><h2>Erase this virtual machine?</h2><p>This permanently deletes the saved boot image and VM snapshot from this browser. It cannot be undone. It does not scan or disinfect your host computer.</p><div><button className="button subtle" onClick={() => setConfirmWipe(false)}>Cancel</button><button className="button danger-button" onClick={erase}>Erase everything</button></div></div></div>}
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
