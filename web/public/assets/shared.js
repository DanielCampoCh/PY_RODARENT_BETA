/* RodaRent — utilidades compartidas de la interfaz (formato, iconos, ilustraciones, reglas de lectura y API).
   Los datos vienen del servidor; las reglas importantes se validan otra vez en el servidor. */
(function () {
  const RR = (window.RR = window.RR || {});

  RR.BUSINESS = { name: "", city: "", phone: "", hours: "", locations: [] };

  /* ---------- Formato ---------- */
  const moneyFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  RR.money = (n) => moneyFmt.format(n || 0);
  RR.fmtDate = (iso, opts) => new Date(iso).toLocaleDateString("es-CO", opts || { day: "numeric", month: "short" });
  RR.fmtDateLong = (iso) => new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
  RR.fmtTime = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  RR.fmtDT = (iso) => `${RR.fmtDateLong(iso)} · ${RR.fmtTime(iso)}`;
  RR.days = (a, b) => Math.max(1, Math.ceil((new Date(b) - new Date(a)) / 86400000));
  RR.sameDay = (a, b) => { a = new Date(a); b = new Date(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  RR.startOfDay = (d) => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
  RR.addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
  RR.relTime = (iso) => {
    const diff = new Date(iso) - Date.now();
    const abs = Math.abs(diff), h = Math.round(abs / 3600000), m = Math.round(abs / 60000);
    const t = abs < 3600000 ? `${m} min` : abs < 86400000 ? `${h} h` : `${Math.round(abs / 86400000)} d`;
    return diff >= 0 ? `en ${t}` : `hace ${t}`;
  };
  RR.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  RR.initials = (name) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  RR.toLocalInput = (d) => { d = new Date(d); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

  /* ---------- Iconos (trazo, 24x24) ---------- */
  const ic = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  RR.icon = {
    users: ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    gear: ic('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 8v8M18 8v4H6"/>'),
    fuel: ic('<path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M3 22h12M7 8h4"/><path d="M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>'),
    bag: ic('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    cal: ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    pin: ic('<path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
    check: ic('<path d="M20 6 9 17l-5-5"/>'),
    x: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
    chat: ic('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    car: ic('<path d="M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 17v-4l2-5h14l2 5v4"/><path d="M3 13h18"/>'),
    home: ic('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    list: ic('<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
    user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    settings: ic('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    bell: ic('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    shield: ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
    arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    back: ic('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
    alert: ic('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    edit: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    menu: ic('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    send: ic('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
    doc: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
    out: ic('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    bot: ic('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/>'),
    link: ic('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    star: ic('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
    wa: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8.2 8.2 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.5 3.5 0 0 0-1.1 2.6 6 6 0 0 0 1.3 3.2 13.8 13.8 0 0 0 5.3 4.7c2 .8 2.8.9 3.8.7a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm0-21.6A11.8 11.8 0 0 0 1.9 18L.2 24l6.2-1.6A11.8 11.8 0 1 0 12 .2z"/></svg>`,
  };

  /* ---------- Ilustración de vehículo (SVG original, sin fotos con derechos) ---------- */
  const BODIES = {
    sedan: { body: "M20,105 L20,86 Q22,73 40,71 L92,66 L124,42 Q134,35 150,35 L208,35 Q224,35 236,45 L262,66 L292,72 Q303,75 303,89 L303,105 Z", win: ["M101,66 L129,44 Q136,39 150,39 L174,39 L174,66 Z", "M181,39 L207,39 Q219,39 229,47 L251,66 L181,66 Z"], w: [86, 238] },
    hatch: { body: "M30,105 L30,80 Q32,69 48,67 L72,64 L97,38 Q104,32 117,32 L196,32 Q209,32 219,42 L246,64 L280,70 Q292,73 292,87 L292,105 Z", win: ["M80,64 L102,40 Q107,36 117,36 L150,36 L150,64 Z", "M157,36 L195,36 Q205,36 213,44 L234,64 L157,64 Z"], w: [82, 240] },
    suv: { body: "M18,105 L18,74 Q20,63 34,61 L66,58 L92,30 Q97,25 108,25 L246,25 Q258,25 265,33 L290,59 Q303,63 303,77 L303,105 Z", win: ["M76,58 L98,33 Q101,30 108,30 L150,30 L150,58 Z", "M157,30 L208,30 L208,58 L157,58 Z", "M215,30 L245,30 Q253,30 258,36 L279,58 L215,58 Z"], w: [84, 240] },
    pickup: { body: "M14,105 L14,70 L140,70 L148,68 L160,36 Q163,30 172,30 L228,30 Q238,30 244,38 L264,65 L293,71 Q305,74 305,88 L305,105 Z", win: ["M166,65 L175,36 L201,36 L201,65 Z", "M207,36 L227,36 Q234,36 239,42 L255,65 L207,65 Z"], w: [74, 244], extra: '<path d="M14,70 L140,70" stroke="rgba(0,0,0,.18)" stroke-width="2"/><path d="M14,80 L142,80" stroke="rgba(255,255,255,.25)" stroke-width="2"/>' },
    van: { body: "M14,105 L14,42 Q14,24 32,24 L238,24 Q251,24 259,34 L290,64 Q305,68 305,83 L305,105 Z", win: ["M28,33 h46 v26 h-46 Z", "M82,33 h46 v26 h-46 Z", "M136,33 h46 v26 h-46 Z", "M190,33 h44 v26 h-44 Z", "M242,33 L278,62 L242,62 Z"], w: [76, 248] },
  };
  RR.carSVG = function (type, color) {
    const b = BODIES[type] || BODIES.sedan;
    const wheel = (x) => `<circle cx="${x}" cy="106" r="25" fill="#1d2330"/><circle cx="${x}" cy="106" r="19" fill="#2b313d"/><circle cx="${x}" cy="106" r="10" fill="#c9ced8"/><circle cx="${x}" cy="106" r="3.5" fill="#6b7280"/>`;
    return `<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="162" cy="128" rx="140" ry="7" fill="rgba(16,24,40,.12)"/>
      <path d="${b.body}" fill="${color}"/>
      <path d="${b.body}" fill="url(#shine)" opacity=".55"/>
      ${b.win.map((w) => `<path d="${w}" fill="#cfe0ee"/><path d="${w}" fill="url(#glass)"/>`).join("")}
      ${b.extra || ""}
      <rect x="292" y="80" width="10" height="6" rx="2" fill="#fde68a"/>
      <rect x="16" y="82" width="7" height="6" rx="2" fill="#f87171"/>
      ${b.w.map(wheel).join("")}
      <defs>
        <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
    </svg>`;
  };

  /* ---------- Etiquetas de estado ---------- */
  RR.RES_STATUS = {
    pendiente: { label: "Pendiente", cls: "b-warn" },
    aprobada: { label: "Confirmada", cls: "b-info" },
    en_curso: { label: "En curso", cls: "b-brand" },
    finalizada: { label: "Finalizada", cls: "b-ok" },
    rechazada: { label: "Rechazada", cls: "b-danger" },
    vencida: { label: "Vencida", cls: "b-neutral" },
    cancelada: { label: "Cancelada", cls: "b-neutral" },
  };
  RR.VEH_STATUS = {
    disponible: { label: "Disponible", cls: "b-ok" },
    reservado: { label: "Reservado", cls: "b-info" },
    alquilado: { label: "Alquilado", cls: "b-brand" },
    mantenimiento: { label: "Mantenimiento", cls: "b-warn" },
    inactivo: { label: "Inactivo", cls: "b-neutral" },
  };
  RR.VERIF = {
    verificado: { label: "Verificado", cls: "b-ok" },
    pendiente: { label: "Pendiente", cls: "b-warn" },
    rechazado: { label: "Rechazado", cls: "b-danger" },
  };
  RR.CONV_STATUS = {
    ia: { label: "Atendida por IA", cls: "b-brand" },
    humano: { label: "Con asesor", cls: "b-info" },
    pendiente: { label: "Requiere atención", cls: "b-danger" },
    cerrada: { label: "Cerrada", cls: "b-neutral" },
  };
  RR.ORIGIN = { web: "Web", whatsapp: "WhatsApp", manual: "Manual", chat: "Chat web" };
  RR.TYPE_LABEL = { sedan: "Sedán", hatch: "Hatchback", suv: "SUV", pickup: "Camioneta", van: "Van" };
  RR.badge = (map, key) => { const s = map[key] || { label: key, cls: "b-neutral" }; return `<span class="badge ${s.cls}">${s.label}</span>`; };
  RR.BLOCKING = ["pendiente", "aprobada", "en_curso"];

  RR.REQ_ITEMS = [
    { key: "identidad", label: "Documento de identidad" },
    { key: "licencia", label: "Licencia vigente y categoría" },
    { key: "edad", label: "Edad mínima" },
    { key: "contacto", label: "Contacto verificable" },
    { key: "deposito", label: "Depósito / garantía" },
  ];
  // El requisito de antecedentes solo cuenta si está activado en Ajustes.
  RR.reqItems = () => [...RR.REQ_ITEMS, ...(RR.store.state?.settings?.antecedentesActiva ? [{ key: "antecedentes", label: "Antecedentes (Policía y Procuraduría)" }] : [])];

  /* ---------- Estado y API ---------- */
  // El estado viene del servidor (base de datos). Aquí solo se guarda en memoria para pintar la interfaz.
  RR.store = { state: null };
  RR.api = async function (path, body, method) {
    const res = await fetch(path, { method: method || (body ? "POST" : "GET"), headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    let data = null;
    try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
    if (!res.ok) { const err = new Error((data && data.error) || "No se pudo completar la acción. Intenta de nuevo."); err.status = res.status; throw err; }
    return data;
  };
  RR.setBusiness = function (negocio, settings) {
    RR.BUSINESS = { name: negocio.nombre, city: negocio.ciudad, phone: negocio.whatsapp, hours: settings.horario, locations: settings.lugares };
  };

  RR.get = {
    vehicle: (id) => RR.store.state.vehicles.find((v) => v.id === id),
    customer: (id) => RR.store.state.customers.find((c) => c.id === id),
    reservation: (id) => RR.store.state.reservations.find((r) => r.id === id),
  };


  RR.isBlocking = (r) => RR.BLOCKING.includes(r.estado) && !(r.estado === "pendiente" && r.expira && new Date(r.expira) < new Date());

  RR.conflicts = function (vehicleId, inicio, fin, excludeId) {
    const a = new Date(inicio), b = new Date(fin);
    return RR.store.state.reservations.filter((r) => r.vehiculo === vehicleId && (!excludeId || r.id !== excludeId) && RR.isBlocking(r) && new Date(r.inicio) < b && new Date(r.fin) > a);
  };

  RR.isAvailable = function (v, inicio, fin) {
    if (v.estado === "mantenimiento" || v.estado === "inactivo") return false;
    return RR.conflicts(v.id, inicio, fin).length === 0;
  };

  /* Estado visible del vehículo: los estados "reservado"/"alquilado" se derivan de las reservas */
  RR.vehicleStatus = function (v) {
    if (v.estado === "mantenimiento" || v.estado === "inactivo") return v.estado;
    const now = new Date();
    const active = RR.store.state.reservations.filter((r) => r.vehiculo === v.id && RR.isBlocking(r) && new Date(r.inicio) <= now && new Date(r.fin) > now);
    if (active.some((r) => r.estado === "en_curso")) return "alquilado";
    if (active.length) return "reservado";
    return "disponible";
  };

  RR.verifOverall = function (c) {
    const vals = RR.reqItems().map((it) => (c.verif || {})[it.key] || "pendiente");
    if (vals.includes("rechazado")) return "rechazado";
    if (vals.length && vals.every((v) => v === "verificado")) return "verificado";
    return "pendiente";
  };

  /* ---------- UI compartida ---------- */
  RR.toast = function (text, err) {
    let wrap = document.querySelector(".toasts");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toasts"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast" + (err ? " err" : "");
    t.innerHTML = (err ? RR.icon.alert : RR.icon.check).replace("<svg", '<svg width="16" height="16"') + `<span>${RR.esc(text)}</span>`;
    wrap.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .25s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 260); }, 2800);
  };

  /* Confirmación dentro de la página (los diálogos nativos confirm() no funcionan en todos los visores) */
  RR.confirm = function (title, text, okLabel, onYes, danger) {
    const m = RR.openModal(`<div class="modal-head"><h2>${RR.esc(title)}</h2></div>
      <div class="modal-body"><p class="muted">${RR.esc(text)}</p></div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes ${danger ? 'style="border-color:var(--danger)"' : ""}>${RR.esc(okLabel)}</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "440px";
    m.el.querySelector("[data-yes]").addEventListener("click", () => { m.close(); onYes(); });
  };

  RR.openModal = function (html, { drawer = false, onClose } = {}) {
    const ov = document.createElement("div");
    ov.className = "overlay" + (drawer ? " right" : "");
    ov.innerHTML = drawer ? `<div class="drawer" role="dialog" aria-modal="true">${html}</div>` : `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); onClose && onClose(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    ov.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    return { el: ov, close };
  };
})();
