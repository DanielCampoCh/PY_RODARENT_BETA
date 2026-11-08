/* RodaRent — datos ficticios, utilidades y "almacén" local del prototipo.
   Todo se guarda en localStorage del navegador: NO hay servidor, base de datos,
   WhatsApp, IA ni Google Calendar conectados. */
(function () {
  const RR = (window.RR = window.RR || {});
  const KEY = "rodarent_demo_v1";

  RR.BUSINESS = {
    name: "Autos del Valle",
    city: "Medellín",
    phone: "+57 300 000 0000",
    hours: "Lun a Sáb · 7:00 a. m. – 7:00 p. m.",
    locations: ["Oficina principal (El Poblado)", "Aeropuerto José María Córdova", "Terminal del Sur", "Domicilio (costo adicional)"],
  };

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
  RR.ORIGIN = { web: "Web", whatsapp: "WhatsApp", manual: "Manual" };
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

  /* ---------- Datos semilla (relativos a hoy, para que la demo siempre luzca actual) ---------- */
  function at(dayOffset, hour, min = 0) { const d = RR.startOfDay(new Date()); d.setDate(d.getDate() + dayOffset); d.setHours(hour, min, 0, 0); return d.toISOString(); }
  function hoursFromNow(h) { return new Date(Date.now() + h * 3600000).toISOString(); }
  const V = (o) => o;

  function seed() {
    const vehicles = [
      V({ id: "v1", marca: "Kia", modelo: "Picanto", anio: 2024, placa: "JKM-482", tipo: "hatch", capacidad: 5, maletas: 1, transmision: "Mecánica", combustible: "Gasolina", color: "#e5484d", precio: 140000, deposito: 600000, estado: "disponible", destacado: "Económico" }),
      V({ id: "v2", marca: "Chevrolet", modelo: "Onix", anio: 2024, placa: "LQT-215", tipo: "sedan", capacidad: 5, maletas: 2, transmision: "Automática", combustible: "Gasolina", color: "#f1f3f5", precio: 165000, deposito: 700000, estado: "disponible", destacado: "Más pedido" }),
      V({ id: "v3", marca: "Mazda", modelo: "2 Sedán", anio: 2023, placa: "HZR-907", tipo: "sedan", capacidad: 5, maletas: 2, transmision: "Automática", combustible: "Gasolina", color: "#8e1b2c", precio: 180000, deposito: 800000, estado: "disponible" }),
      V({ id: "v4", marca: "Renault", modelo: "Duster 4x4", anio: 2022, placa: "GTP-330", tipo: "suv", capacidad: 5, maletas: 3, transmision: "Mecánica", combustible: "Gasolina", color: "#6b7a4b", precio: 230000, deposito: 1000000, estado: "mantenimiento" }),
      V({ id: "v5", marca: "Kia", modelo: "Sportage", anio: 2024, placa: "NBV-118", tipo: "suv", capacidad: 5, maletas: 3, transmision: "Automática", combustible: "Híbrido", color: "#3b4a63", precio: 280000, deposito: 1200000, estado: "disponible", destacado: "Híbrido" }),
      V({ id: "v6", marca: "Toyota", modelo: "Fortuner", anio: 2023, placa: "KYD-764", tipo: "suv", capacidad: 7, maletas: 4, transmision: "Automática", combustible: "Diésel", color: "#1f2937", precio: 380000, deposito: 1800000, estado: "disponible", destacado: "7 puestos" }),
      V({ id: "v7", marca: "Toyota", modelo: "Hilux", anio: 2023, placa: "MRS-551", tipo: "pickup", capacidad: 5, maletas: 4, transmision: "Mecánica", combustible: "Diésel", color: "#9aa3ad", precio: 350000, deposito: 1600000, estado: "disponible" }),
      V({ id: "v8", marca: "Hyundai", modelo: "H1 Van", anio: 2022, placa: "PLX-209", tipo: "van", capacidad: 12, maletas: 8, transmision: "Mecánica", combustible: "Diésel", color: "#f8f9fa", precio: 420000, deposito: 2000000, estado: "disponible", destacado: "Grupos" }),
    ];

    const ok = { identidad: "verificado", licencia: "verificado", edad: "verificado", contacto: "verificado", deposito: "verificado" };
    const customers = [
      { id: "c1", nombre: "Laura Gómez Restrepo", doc: "CC 1.036.552.781", tel: "+57 310 555 0142", email: "laura.gomez@ejemplo.com", edad: 34, licencia: "B1", licVence: "2029-03-14", origen: "web", creado: at(-20, 9), verif: { ...ok } },
      { id: "c2", nombre: "Mateo Castaño", doc: "CC 98.765.443", tel: "+57 301 555 0199", email: "mateo.c@ejemplo.com", edad: 41, licencia: "B2", licVence: "2028-11-02", origen: "whatsapp", creado: at(-15, 11), verif: { ...ok } },
      { id: "c3", nombre: "Daniela Ospina", doc: "CC 1.152.330.908", tel: "+57 315 555 0110", email: "dani.ospina@ejemplo.com", edad: 27, licencia: "B1", licVence: "2030-06-21", origen: "web", creado: at(-6, 16), verif: { ...ok } },
      { id: "c4", nombre: "Santiago Vélez", doc: "CC 71.234.889", tel: "+57 320 555 0177", email: "svelez@ejemplo.com", edad: 38, licencia: "B1", licVence: "2027-08-30", origen: "manual", creado: at(-30, 10), verif: { ...ok } },
      { id: "c5", nombre: "Carlos Ramírez", doc: "CC 1.017.889.214", tel: "+57 304 555 0163", email: "carlos.ramirez@ejemplo.com", edad: 29, licencia: "B1", licVence: "2028-01-15", origen: "whatsapp", creado: at(0, 8, 40), verif: { identidad: "verificado", licencia: "pendiente", edad: "verificado", contacto: "verificado", deposito: "pendiente" } },
      { id: "c6", nombre: "Mariana López", doc: "CC 1.040.778.120", tel: "+57 311 555 0128", email: "mariana.lopez@ejemplo.com", edad: 24, licencia: "B1", licVence: "2029-09-09", origen: "web", creado: at(-1, 19, 15), verif: { identidad: "verificado", licencia: "verificado", edad: "verificado", contacto: "pendiente", deposito: "pendiente" } },
      { id: "c7", nombre: "Valentina Mejía", doc: "CC 43.998.201", tel: "+57 300 555 0185", email: "vale.mejia@ejemplo.com", edad: 36, licencia: "B2", licVence: "2031-02-01", origen: "whatsapp", creado: at(0, 7, 55), verif: { identidad: "pendiente", licencia: "pendiente", edad: "pendiente", contacto: "verificado", deposito: "pendiente" } },
      { id: "c8", nombre: "Felipe Arango", doc: "CC 1.128.441.662", tel: "+57 312 555 0136", email: "farango@ejemplo.com", edad: 20, licencia: "B1", licVence: "2025-04-10", origen: "web", creado: at(-3, 12), verif: { identidad: "verificado", licencia: "rechazado", edad: "rechazado", contacto: "verificado", deposito: "pendiente" } },
      { id: "c9", nombre: "Andrea Torres", doc: "—", tel: "+57 318 555 0151", email: "", edad: null, licencia: "", licVence: "", origen: "whatsapp", creado: at(0, 9, 20), verif: { identidad: "pendiente", licencia: "pendiente", edad: "pendiente", contacto: "verificado", deposito: "pendiente" } },
    ];

    let n = 1040;
    const mk = (o) => {
      const v = vehicles.find((x) => x.id === o.vehiculo);
      const dias = RR.days(o.inicio, o.fin);
      return { id: "r" + n, codigo: "RR-" + n++, lugar: RR.BUSINESS.locations[0], devolucion: RR.BUSINESS.locations[0], expira: null, notas: "", precioDia: v.precio, dias, total: dias * v.precio, deposito: v.deposito, creado: at(-1, 10), historial: [], ...o };
    };
    const reservations = [
      mk({ cliente: "c3", vehiculo: "v3", inicio: at(-12, 9), fin: at(-9, 9), estado: "finalizada", origen: "web", creado: at(-15, 10) }),
      mk({ cliente: "c4", vehiculo: "v5", inicio: at(-9, 8), fin: at(-6, 18), estado: "finalizada", origen: "manual", creado: at(-12, 10) }),
      mk({ cliente: "c1", vehiculo: "v2", inicio: at(-2, 10), fin: at(1, 10), estado: "en_curso", origen: "web", creado: at(-5, 15), lugar: RR.BUSINESS.locations[1], devolucion: RR.BUSINESS.locations[1] }),
      mk({ cliente: "c2", vehiculo: "v6", inicio: at(-1, 8), fin: at(3, 18), estado: "en_curso", origen: "whatsapp", creado: at(-4, 9) }),
      mk({ cliente: "c3", vehiculo: "v1", inicio: at(0, 15), fin: at(2, 15), estado: "aprobada", origen: "web", creado: at(-2, 11) }),
      mk({ cliente: "c4", vehiculo: "v5", inicio: at(1, 9), fin: at(4, 9), estado: "aprobada", origen: "manual", creado: at(-3, 17), lugar: RR.BUSINESS.locations[2] }),
      mk({ cliente: "c5", vehiculo: "v7", inicio: at(3, 7), fin: at(6, 19), estado: "pendiente", origen: "whatsapp", creado: hoursFromNow(-6), expira: hoursFromNow(18), notas: "Viaje de trabajo a Urabá. Pidió confirmar si puede recoger 6:30 a. m." }),
      mk({ cliente: "c6", vehiculo: "v3", inicio: at(5, 10), fin: at(8, 10), estado: "pendiente", origen: "web", creado: hoursFromNow(-21), expira: hoursFromNow(3) }),
      mk({ cliente: "c7", vehiculo: "v8", inicio: at(10, 6), fin: at(12, 20), estado: "pendiente", origen: "whatsapp", creado: hoursFromNow(-2), expira: hoursFromNow(22), notas: "Paseo familiar, 10 personas." }),
      mk({ cliente: "c8", vehiculo: "v2", inicio: at(6, 9), fin: at(8, 9), estado: "rechazada", origen: "web", creado: at(-3, 12), notas: "Licencia vencida y no cumple edad mínima (21)." }),
      mk({ cliente: "c1", vehiculo: "v2", inicio: at(8, 9), fin: at(11, 9), estado: "aprobada", origen: "web", creado: at(-1, 13) }),
      mk({ cliente: "c2", vehiculo: "v1", inicio: at(4, 9), fin: at(5, 18), estado: "vencida", origen: "whatsapp", creado: at(-2, 9), notas: "El cliente no completó documentos en 24 h." }),
      mk({ cliente: "c4", vehiculo: "v8", inicio: at(15, 7), fin: at(18, 19), estado: "aprobada", origen: "manual", creado: at(-1, 9) }),
    ];
    reservations.forEach((r) => r.historial.push({ fecha: r.creado, texto: `Solicitud creada (${RR.ORIGIN[r.origen]})`, actor: r.origen === "manual" ? "Administrador" : r.origen === "whatsapp" ? "Asistente IA" : "Cliente (web)" }));

    const conversations = [
      { id: "k1", cliente: "c5", nombre: "Carlos Ramírez", tel: "+57 304 555 0163", estado: "ia", reserva: "r1046", ultima: hoursFromNow(-6), noLeidos: 0, mensajes: [
        ["cliente", "Hola, buenas. Necesito una camioneta para la otra semana", -6.4],
        ["ia", "¡Hola Carlos! 👋 Soy el asistente de Autos del Valle. Con gusto te ayudo. ¿Qué días la necesitas y dónde la recogerías?", -6.4],
        ["cliente", `Del ${RR.fmtDate(at(3, 7))} al ${RR.fmtDate(at(6, 19))}, en la oficina. Es para ir a Urabá por trabajo`, -6.3],
        ["ia", "Perfecto. Para carretera te recomiendo la Toyota Hilux 4x4 (diésel, 5 puestos): $350.000/día. Por 4 días serían $1.400.000 + depósito reembolsable de $1.600.000. ¿Te la aparto?", -6.3],
        ["cliente", "Sí, de una", -6.2],
        ["ia", "Listo ✅ Te la dejo pre-reservada por 24 h mientras revisamos tus documentos. Te envié el enlace para subir cédula y licencia.", -6.2],
        ["sistema", "Solicitud RR-1046 creada · Pre-reserva vence en 24 h", -6.2],
      ] },
      { id: "k2", cliente: "c9", nombre: "Andrea Torres", tel: "+57 318 555 0151", estado: "pendiente", reserva: null, ultima: hoursFromNow(-1.2), noLeidos: 2, mensajes: [
        ["cliente", "Hola, quiero alquilar un carro por 2 semanas, ¿me hacen descuento?", -1.5],
        ["ia", "¡Hola Andrea! Claro que sí revisamos tarifas para alquileres largos. ¿Qué tipo de vehículo te interesa y para qué fechas?", -1.5],
        ["cliente", "Un sedán automático, desde el 1 hasta el 15 del próximo mes. Pero necesito saber el precio final con descuento", -1.3],
        ["ia", "Entiendo. Los descuentos por larga duración los aprueba directamente el propietario, así que te comunico con un asesor para darte el mejor precio. Te responderá en breve 🙌", -1.2],
        ["sistema", "Conversación transferida a un asesor · Motivo: negociación de tarifa", -1.2],
        ["cliente", "Ok, quedo atenta", -1.2],
      ] },
      { id: "k3", cliente: null, nombre: "Juan Pablo Ríos", tel: "+57 316 555 0104", estado: "ia", reserva: null, ultima: hoursFromNow(-27), noLeidos: 0, seguimiento: true, mensajes: [
        ["cliente", "Buenas, ¿cuánto vale el alquiler del Onix?", -27.5],
        ["ia", "¡Hola Juan Pablo! El Chevrolet Onix automático está en $165.000/día, con kilometraje libre dentro de Antioquia. ¿Para qué fechas lo necesitas?", -27.5],
        ["cliente", "Aún no sé, estoy cotizando", -27.2],
        ["ia", "¡Claro! ¿Te parece si te escribo en unos días para ayudarte con la reserva? Solo lo haré si me autorizas.", -27.2],
        ["cliente", "Sí, dale", -27],
        ["sistema", "Consentimiento de seguimiento comercial registrado · Recordatorio programado", -27],
      ] },
      { id: "k4", cliente: "c7", nombre: "Valentina Mejía", tel: "+57 300 555 0185", estado: "ia", reserva: "r1048", ultima: hoursFromNow(-2), noLeidos: 0, mensajes: [
        ["cliente", "Hola! Somos 10 personas para un paseo, ¿tienen algo?", -2.3],
        ["ia", "¡Hola Valentina! Para 10 personas tenemos la Hyundai H1 Van de 12 puestos 🚐 a $420.000/día. ¿Qué fechas tienes en mente?", -2.3],
        ["cliente", `Del ${RR.fmtDate(at(10, 6))} al ${RR.fmtDate(at(12, 20))}`, -2.1],
        ["ia", "¡Está disponible! Serían 3 días: $1.260.000 + depósito de $2.000.000. ¿Deseas que la aparte?", -2.1],
        ["cliente", "Sí porfa", -2],
        ["sistema", "Solicitud RR-1048 creada · Faltan documentos del conductor", -2],
      ] },
      { id: "k5", cliente: null, nombre: "Sofía Herrera", tel: "+57 313 555 0190", estado: "pendiente", reserva: null, ultima: hoursFromNow(-0.4), noLeidos: 1, mensajes: [
        ["cliente", "¿Puedo recoger el carro en Medellín y entregarlo en Bogotá?", -0.5],
        ["ia", "¡Buena pregunta, Sofía! Las entregas en otra ciudad tienen condiciones especiales. Ya le pasé tu consulta a un asesor para darte una respuesta exacta.", -0.4],
        ["sistema", "Transferida a un asesor · Motivo: devolución en otra ciudad", -0.4],
      ] },
      { id: "k6", cliente: "c2", nombre: "Mateo Castaño", tel: "+57 301 555 0199", estado: "humano", reserva: "r1043", ultima: hoursFromNow(-20), noLeidos: 0, mensajes: [
        ["cliente", "Hola, ¿puedo devolver la Fortuner un día después?", -20.5],
        ["ia", "Déjame confirmar con el equipo la disponibilidad para extender tu reserva.", -20.5],
        ["humano", "Hola Mateo, soy Daniel. Sí, te la extendemos un día sin problema. Te actualizo la reserva 👍", -20],
      ] },
    ];
    conversations.forEach((c) => (c.mensajes = c.mensajes.map(([emisor, texto, h]) => ({ emisor, texto, fecha: hoursFromNow(h) }))));

    return {
      version: 1,
      vehicles, customers, reservations, conversations,
      settings: { prereservaHoras: 24, edadMinima: 21, licenciaVigente: true, categorias: ["B1", "B2", "C1"], depositoObligatorio: true, experienciaMin: 2, experienciaActiva: false, docAdicional: false, retencionDias: 90, recordatorioHoras: 24 },
      audit: [
        { fecha: hoursFromNow(-20), actor: "Daniel (Admin)", accion: "Extendió fechas de RR-1043" },
        { fecha: at(-3, 13), actor: "Daniel (Admin)", accion: "Rechazó RR-1049 · requisitos no cumplidos" },
        { fecha: at(-2, 9), actor: "Sistema", accion: "RR-1051 vencida automáticamente (24 h sin documentos)" },
      ],
      notifications: [],
      nextCode: n,
    };
  }

  /* ---------- Almacén ---------- */
  RR.store = {
    state: null,
    load() {
      try { const raw = localStorage.getItem(KEY); this.state = raw ? JSON.parse(raw) : null; } catch (e) { this.state = null; }
      if (!this.state || this.state.version !== 1) { this.state = seed(); this.save(); }
      RR.expireOld();
      return this.state;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* modo privado: la demo sigue en memoria */ } },
    reset() { this.state = seed(); this.save(); },
  };

  RR.get = {
    vehicle: (id) => RR.store.state.vehicles.find((v) => v.id === id),
    customer: (id) => RR.store.state.customers.find((c) => c.id === id),
    reservation: (id) => RR.store.state.reservations.find((r) => r.id === id),
  };

  RR.log = function (actor, accion) { RR.store.state.audit.unshift({ fecha: new Date().toISOString(), actor, accion }); };

  RR.isBlocking = (r) => RR.BLOCKING.includes(r.estado) && !(r.estado === "pendiente" && r.expira && new Date(r.expira) < new Date());

  RR.conflicts = function (vehicleId, inicio, fin, excludeId) {
    const a = new Date(inicio), b = new Date(fin);
    return RR.store.state.reservations.filter((r) => r.vehiculo === vehicleId && r.id !== excludeId && RR.isBlocking(r) && new Date(r.inicio) < b && new Date(r.fin) > a);
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
    const vals = Object.values(c.verif || {});
    if (vals.includes("rechazado")) return "rechazado";
    if (vals.length && vals.every((v) => v === "verificado")) return "verificado";
    return "pendiente";
  };

  RR.createReservation = function (data, actor) {
    const s = RR.store.state;
    const v = RR.get.vehicle(data.vehiculo);
    if (!v) return { ok: false, error: "Vehículo no encontrado." };
    if (new Date(data.fin) <= new Date(data.inicio)) return { ok: false, error: "La devolución debe ser posterior a la recogida." };
    if (v.estado === "mantenimiento" || v.estado === "inactivo") return { ok: false, error: `El ${v.marca} ${v.modelo} está en ${v.estado}.` };
    const c = RR.conflicts(v.id, data.inicio, data.fin);
    if (c.length) return { ok: false, error: `Conflicto: el vehículo ya tiene ${c.map((x) => x.codigo).join(", ")} en esas fechas.`, conflicts: c };
    const dias = RR.days(data.inicio, data.fin);
    const id = "r" + s.nextCode;
    const r = {
      id, codigo: "RR-" + s.nextCode++, cliente: data.cliente, vehiculo: v.id, inicio: data.inicio, fin: data.fin,
      lugar: data.lugar || RR.BUSINESS.locations[0], devolucion: data.devolucion || data.lugar || RR.BUSINESS.locations[0],
      estado: data.estado || "pendiente", origen: data.origen || "web",
      expira: (data.estado || "pendiente") === "pendiente" ? new Date(Date.now() + s.settings.prereservaHoras * 3600000).toISOString() : null,
      precioDia: v.precio, dias, total: dias * v.precio, deposito: v.deposito, notas: data.notas || "",
      creado: new Date().toISOString(), nueva: data.origen !== "manual",
      historial: [{ fecha: new Date().toISOString(), texto: `Solicitud creada (${RR.ORIGIN[data.origen || "web"]})`, actor }],
    };
    s.reservations.push(r);
    if (data.origen !== "manual") s.notifications.unshift({ fecha: r.creado, texto: `Nueva solicitud ${r.codigo} desde ${RR.ORIGIN[r.origen]}`, leida: false });
    RR.log(actor, `Creó ${r.codigo} (${v.marca} ${v.modelo})`);
    RR.store.save();
    return { ok: true, reservation: r };
  };

  RR.upsertCustomer = function (data) {
    const s = RR.store.state;
    let c = s.customers.find((x) => (data.doc && x.doc === data.doc) || (data.tel && x.tel === data.tel));
    if (!c) {
      c = { id: "c" + Date.now().toString(36), creado: new Date().toISOString(), verif: { identidad: "pendiente", licencia: "pendiente", edad: "pendiente", contacto: "pendiente", deposito: "pendiente" }, ...data };
      s.customers.push(c);
    } else Object.assign(c, Object.fromEntries(Object.entries(data).filter(([, v]) => v)));
    return c;
  };

  RR.setStatus = function (id, estado, actor, nota) {
    const r = RR.get.reservation(id);
    const prev = r.estado;
    r.estado = estado;
    if (estado !== "pendiente") r.expira = null;
    r.nueva = false;
    r.historial.push({ fecha: new Date().toISOString(), texto: `${RR.RES_STATUS[prev].label} → ${RR.RES_STATUS[estado].label}${nota ? " · " + nota : ""}`, actor });
    RR.log(actor, `${RR.RES_STATUS[estado].label}: ${r.codigo}${nota ? " · " + nota : ""}`);
    RR.store.save();
  };

  RR.expireOld = function () {
    const s = RR.store.state; let changed = false;
    s.reservations.forEach((r) => {
      if (r.estado === "pendiente" && r.expira && new Date(r.expira) < new Date()) {
        r.estado = "vencida"; r.expira = null; changed = true;
        r.historial.push({ fecha: new Date().toISOString(), texto: "Pre-reserva vencida automáticamente", actor: "Sistema" });
        RR.log("Sistema", `${r.codigo} vencida automáticamente`);
      }
    });
    if (changed) RR.store.save();
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
