/* RodaRent — panel administrativo (prototipo) */
(function () {
  let S = null;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const I = RR.icon;
  const esc = RR.esc;

  /* ---------- Sesión (validada en el servidor) ---------- */
  let me = null;
  const isAdmin = () => me && me.key === "admin";

  const state = { view: "resumen", resTab: "todas", resQ: "", calMode: "semana", calDate: RR.startOfDay(new Date()), vehTab: "todos", cliQ: "", convFilter: "todas", convSel: null, vehMod: "todos", alTab: "todas", servTab: "todos" };

  /** Carga el estado desde el servidor. Devuelve false si no hay sesión. */
  async function cargar() {
    try {
      S = await RR.api("/api/admin/estado");
    } catch (e) {
      if (e.status === 401) return false;
      throw e;
    }
    RR.store.state = S;
    me = S.me;
    RR.setBusiness(S.negocio, S.settings);
    return true;
  }

  /** Ejecuta una acción en el servidor y recarga los datos. */
  async function act(tipo, datos = {}, okMsg) {
    try {
      const r = await RR.api("/api/admin/accion", { tipo, ...datos });
      await cargar();
      if (okMsg) RR.toast(okMsg);
      return r;
    } catch (e) {
      if (e.status === 401) { location.reload(); return null; }
      RR.toast(e.message, true);
      return null;
    }
  }

  function login() {
    const box = document.createElement("div");
    box.className = "login";
    box.innerHTML = `<form class="box" id="loginForm" novalidate>
      <div class="row" style="gap:10px;margin-bottom:22px"><span style="width:36px;height:36px;border-radius:10px;background:var(--ink);color:var(--gold);display:grid;place-items:center">${RR.marca.replace("<svg", '<svg width="24" height="15"')}</span><div><b style="font-size:17px">RodaRent</b><div class="xs muted">Panel del equipo</div></div></div>
      <h2 style="font-size:20px">Ingresar al panel</h2>
      <p class="small muted" style="margin:6px 0 18px">Usa el correo y la contraseña que te asignó el administrador.</p>
      <div class="stack">
        <div class="field"><label for="lgEmail">Correo</label><input class="input" id="lgEmail" type="email" autocomplete="username" required></div>
        <div class="field"><label for="lgPass">Contraseña</label><input class="input" id="lgPass" type="password" autocomplete="current-password" required></div>
        <div id="lgErr"></div>
        <button class="btn btn-primary btn-lg" type="submit" id="lgBtn">Ingresar</button>
      </div>
      <a href="/" class="small" style="display:inline-block;margin-top:16px;color:var(--brand);font-weight:600">← Volver al sitio público</a>
    </form>`;
    document.body.appendChild(box);
    $("#lgEmail", box).focus();
    $("#loginForm", box).addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#lgBtn", box); btn.disabled = true; btn.textContent = "Ingresando…";
      try {
        await RR.api("/api/auth/login", { email: $("#lgEmail", box).value.trim(), password: $("#lgPass", box).value });
        if (await cargar()) { box.remove(); start(); }
      } catch (err) {
        $("#lgErr", box).innerHTML = `<div class="callout err">${I.alert}<span>${esc(err.message)}</span></div>`;
        btn.disabled = false; btn.textContent = "Ingresar";
      }
    });
  }

  /* ---------- Utilidades ---------- */
  const cust = (id) => RR.get.customer(id) || { nombre: "Cliente", verif: {} };
  const veh = (id) => RR.get.vehicle(id) || { marca: "?", modelo: "", tipo: "sedan", color: "#ccc" };
  const vname = (v) => `${v.marca} ${v.modelo}`;
  // Modalidad del vehículo: alquiler (catálogo), Uber (solo control interno) o agencia aliada (catálogo con comisión).
  const MODALIDAD = { alquiler: ["Alquiler", "b-brand"], uber: ["Uber", "b-info"], agencia: ["Agencia aliada", "b-warn"] };
  const modBadge = (x) => { const [l, c] = MODALIDAD[x.modalidad || "alquiler"]; return `<span class="badge plain ${c}">${l}</span>`; };
  const reservable = (x) => (x.modalidad || "alquiler") !== "uber";
  const alertasGraves = () => (S.alertasFlota || []).filter((a) => a.nivel === "vencido" || a.nivel === "urgente").length;
  const maskDoc = (d) => (isAdmin() || !d ? d : d.replace(/\d(?=[\d.]{4})/g, "•"));
  const pendingCount = () => S.reservations.filter((r) => r.estado === "pendiente").length;
  const unattended = () => S.conversations.filter((c) => c.estado === "pendiente").length;
  const verifBadge = (c) => RR.badge(RR.VERIF, RR.verifOverall(c));
  // Habitual = tiene al menos un alquiler en curso o terminado.
  const alquileres = (c) => S.reservations.filter((r) => r.cliente === c.id && ["en_curso", "finalizada"].includes(r.estado)).length;
  const tipoBadge = (c) => { const n = alquileres(c); return n ? `<span class="badge b-brand" title="${n} alquiler(es)">Habitual · ${n}</span>` : `<span class="badge b-neutral">Nuevo</span>`; };
  const avatar = (name, style = "") => `<span class="avatar" style="${style}">${RR.initials(name)}</span>`;
  const today = () => RR.startOfDay(new Date());
  function refresh() { renderSide(); render(); }

  /* ---------- Shell ---------- */
  const NAV = [
    ["resumen", "Resumen", "home"],
    ["reservas", "Reservas", "list", () => pendingCount()],
    ["calendario", "Calendario", "cal"],
    ["vehiculos", "Vehículos", "car"],
    ["alertas", "Alertas de flota", "alert", () => alertasGraves()],
    ["servicios", "Conductores", "pin", () => (S.servicios || []).filter((x) => x.estado === "nuevo").length],
    ["clientes", "Clientes", "users"],
    ["conversaciones", "Conversaciones", "chat", () => unattended()],
    ["ajustes", "Ajustes", "settings"],
  ];
  function renderSide() {
    $("#side").innerHTML = `
      <div class="brand"><span class="mk">${RR.marca}</span><div>RodaRent<small>${esc(RR.BUSINESS.name)}</small></div></div>
      <nav>${NAV.filter((n) => !n[4] || isAdmin()).map(([k, l, i, cnt]) => { const n = cnt ? cnt() : 0; return `<a href="#${k}" class="${state.view === k ? "active" : ""}">${I[i]}${l}${n ? `<span class="cnt ${k === "reservas" ? "soft" : ""}">${n}</span>` : ""}</a>`; }).join("")}</nav>
      <div class="bottom">
        <a class="linkbtn" href="/" target="_blank" rel="noopener">${I.link}Ver sitio público</a>
        <div class="me">${avatar(me.nombre)}<div class="grow"><b>${esc(me.nombre)}</b><span>${me.rol}</span></div><button class="linkbtn" style="width:auto;padding:6px" id="logout" title="Cerrar sesión" aria-label="Cerrar sesión">${I.out}</button></div>
      </div>`;
    $("#logout").addEventListener("click", async () => { try { await RR.api("/api/auth/logout", {}); } catch (e) {} location.reload(); });
    $$("#side nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("nav-open")));
  }

  const TITLES = {
    resumen: ["Resumen", () => `Hoy, ${new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}`],
    reservas: ["Reservas", () => "Solicitudes del asistente, la web y reservas manuales"],
    calendario: ["Calendario", () => "Ocupación de la flota, entregas y devoluciones"],
    vehiculos: ["Vehículos", () => `${S.vehicles.length} vehículos · ${S.vehicles.filter((x) => x.modalidad === "uber").length} de Uber · ${S.vehicles.filter((x) => x.modalidad === "agencia").length} de la agencia`],
    alertas: ["Alertas de la flota", () => "SOAT, tecnomecánica, seguro, extintor, impuesto, GPS, aceite y pico y placa"],
    servicios: ["Servicios con conductor", () => "Pedidos que el bot envía por WhatsApp a los conductores"],
    clientes: ["Clientes", () => `${S.customers.length} clientes registrados`],
    conversaciones: ["Conversaciones", () => "Chats del sitio web atendidos por la IA y el equipo"],
    ajustes: ["Ajustes", () => "Requisitos, lugares, pico y placa, WhatsApp, usuarios e integraciones"],
  };
  function renderTop() {
    const [t, sub] = TITLES[state.view];
    const unread = S.notifications.filter((n) => !n.leida).length;
    $("#topbar").innerHTML = `
      <button class="btn btn-ghost btn-icon menu-btn" id="menuBtn" aria-label="Menú">${I.menu}</button>
      <div class="grow"><h1>${t}</h1><div class="sub">${sub()}</div></div>
      <div class="actions">
        <button class="btn btn-ghost btn-icon" id="reloadBtn" aria-label="Actualizar" title="Actualizar datos">${I.back.replace("<svg", '<svg style="transform:rotate(-90deg)"')}</button>
        <button class="btn btn-ghost btn-icon bell" id="bellBtn" aria-label="Notificaciones">${I.bell}${unread ? '<span class="dot"></span>' : ""}</button>
        <button class="btn btn-primary" id="newRes">${I.plus}<span class="btn-new-label">Nueva reserva</span></button>
      </div>`;
    $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
    $("#newRes").addEventListener("click", () => newReservation());
    $("#bellBtn").addEventListener("click", toggleNotifs);
    $("#reloadBtn").addEventListener("click", async () => { if (await cargar()) { refresh(); RR.toast("Datos actualizados"); } });
  }

  function toggleNotifs(e) {
    e.stopPropagation();
    const old = $(".notif-pop"); if (old) { old.remove(); return; }
    const items = [...alerts().map((a) => ({ texto: a.text, ic: "alert", fecha: null })), ...S.notifications.slice(0, 8).map((n) => ({ ...n, ic: "bell" }))];
    const pop = document.createElement("div"); pop.className = "notif-pop";
    pop.innerHTML = `<div class="card-head"><h3>Notificaciones</h3>${isAdmin() && S.notifications.length ? '<button class="btn btn-ghost btn-sm" id="nfClear">Vaciar</button>' : '<span class="xs subtle">En el panel</span>'}</div>
      ${items.length ? items.map((n) => `<div class="item"><span class="ic">${I[n.ic]}</span><div><div>${esc(n.texto)}</div>${n.fecha ? `<div class="xs subtle">${RR.relTime(n.fecha)}</div>` : ""}</div></div>`).join("") : '<div class="empty">Sin novedades</div>'}`;
    document.body.appendChild(pop);
    $("#nfClear", pop)?.addEventListener("click", async (ev) => { ev.stopPropagation(); pop.remove(); if (await act("borrar_notifs", {}, "Notificaciones borradas")) renderTop(); });
    if (S.notifications.some((n) => !n.leida)) { S.notifications.forEach((n) => (n.leida = true)); RR.api("/api/admin/accion", { tipo: "leer_notifs" }).catch(() => {}); }
    const close = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener("click", close); renderTop(); } };
    setTimeout(() => document.addEventListener("click", close));
  }

  function alerts() {
    const out = [];
    const now = Date.now();
    S.reservations.filter((r) => r.estado === "pendiente" && r.expira && new Date(r.expira) - now < 6 * 3600000).forEach((r) => out.push({ type: "warn", text: `La pre-reserva ${r.codigo} (${cust(r.cliente).nombre}) vence ${RR.relTime(r.expira)}.`, res: r.id }));
    S.conversations.filter((c) => c.estado === "pendiente").forEach((c) => out.push({ type: "err", text: `${c.nombre} espera respuesta de un asesor desde ${RR.relTime(c.ultima)}.`, conv: c.id }));
    S.reservations.filter((r) => r.estado === "aprobada" && new Date(r.inicio) - now < 24 * 3600000 && new Date(r.inicio) > now).forEach((r) => out.push({ type: "info", text: `Entrega próxima: ${vname(veh(r.vehiculo))} a ${cust(r.cliente).nombre} ${RR.relTime(r.inicio)}.`, res: r.id }));
    S.reservations.filter((r) => r.estado === "pendiente" && RR.verifOverall(cust(r.cliente)) === "rechazado").forEach((r) => out.push({ type: "err", text: `${r.codigo}: el cliente tiene requisitos rechazados.`, res: r.id }));
    const porCompletar = S.vehicles.filter((x) => /^POR-/.test(x.placa)).length;
    if (porCompletar) out.push({ type: "warn", text: `${porCompletar} carro(s) del Instagram sin placa ni tarifa: complétalos en Vehículos para que salgan en la página.`, go: "vehiculos" });
    (S.alertasFlota || []).filter((a) => a.nivel !== "proximo").slice(0, 6).forEach((a) => out.push({ type: a.nivel === "vencido" ? "err" : a.nivel === "urgente" ? "warn" : "info", text: a.texto, veh: a.vehiculo }));
    (S.servicios || []).filter((x) => x.estado === "nuevo" && new Date(x.fecha) - now < 3 * 3600000).forEach((x) => out.push({ type: "warn", text: `El servicio ${x.codigo} (${x.origen} → ${x.destino}) sale ${RR.relTime(x.fecha)} y aún no tiene conductor.`, go: "servicios" }));
    return out;
  }

  /* ---------- Router ---------- */
  function route() {
    const h = location.hash.replace("#", "") || "resumen";
    state.view = TITLES[h] ? h : "resumen";
    renderSide(); render();
    window.scrollTo(0, 0);
  }
  function render() {
    renderTop();
    const v = $("#view");
    ({ resumen: viewResumen, reservas: viewReservas, calendario: viewCalendario, vehiculos: viewVehiculos, clientes: viewClientes, conversaciones: viewConversaciones, alertas: viewAlertas, servicios: viewServicios, ajustes: viewAjustes })[state.view](v);
  }

  /* =================== RESUMEN =================== */
  function viewResumen(v) {
    const now = new Date(), t0 = today(), t1 = RR.addDays(t0, 1);
    const inDay = (iso) => new Date(iso) >= t0 && new Date(iso) < t1;
    const entregasHoy = S.reservations.filter((r) => ["aprobada", "en_curso"].includes(r.estado) && inDay(r.inicio));
    const devolHoy = S.reservations.filter((r) => ["en_curso", "aprobada"].includes(r.estado) && inDay(r.fin));
    const activos = S.reservations.filter((r) => r.estado === "en_curso");
    const pend = S.reservations.filter((r) => r.estado === "pendiente").sort((a, b) => new Date(a.expira) - new Date(b.expira));
    const nuevos = S.customers.filter((c) => now - new Date(c.creado) < 7 * 86400000);
    const fleetOn = S.vehicles.filter((x) => !["mantenimiento", "inactivo"].includes(x.estado));
    const occ = Math.round((fleetOn.filter((x) => ["alquilado", "reservado"].includes(RR.vehicleStatus(x))).length / Math.max(1, fleetOn.length)) * 100);

    const kpi = (lbl, ic, val, hint, go, cls = "") => `<div class="card kpi ${cls}" data-go="${go}"><div class="lbl">${I[ic]}${lbl}</div><div class="val">${val}</div><div class="hint">${hint}</div></div>`;
    const agenda = [];
    for (let d = 0; d < 7; d++) {
      const a = RR.addDays(t0, d), b = RR.addDays(t0, d + 1);
      const evs = [];
      S.reservations.forEach((r) => {
        if (!["aprobada", "en_curso", "pendiente"].includes(r.estado)) return;
        if (new Date(r.inicio) >= a && new Date(r.inicio) < b && r.estado !== "en_curso") evs.push({ t: r.inicio, k: "out", r });
        if (new Date(r.fin) >= a && new Date(r.fin) < b) evs.push({ t: r.fin, k: "in", r });
      });
      if (evs.length) agenda.push({ day: a, evs: evs.sort((x, y) => new Date(x.t) - new Date(y.t)) });
    }
    const al = alerts();

    v.innerHTML = `
      <div class="kpis">
        ${kpi("Solicitudes pendientes", "list", pend.length, pend.length ? `${pend.filter((r) => new Date(r.expira) - now < 6 * 3600000).length} vencen en < 6 h` : "Todo al día", "reservas:pendiente", pend.length ? "" : "")}
        ${kpi("Entregas hoy", "arrow", entregasHoy.length, entregasHoy[0] ? `Próxima ${RR.fmtTime(entregasHoy[0].inicio)}` : "Sin entregas", "calendario")}
        ${kpi("Devoluciones hoy", "back", devolHoy.length, devolHoy[0] ? `Próxima ${RR.fmtTime(devolHoy[0].fin)}` : "Sin devoluciones", "calendario")}
        ${kpi("Alquileres activos", "car", activos.length, `Ocupación de flota ${occ}%`, "reservas:en_curso")}
        ${kpi("Alertas de flota", "alert", alertasGraves(), alertasGraves() ? "Vencidas o por vencer en ≤ 15 días" : "Documentos al día", "alertas", alertasGraves() ? "alert" : "")}
        ${kpi("Sin atender", "chat", unattended(), unattended() ? "Requieren un asesor" : "Nadie esperando", "conversaciones", unattended() ? "alert" : "")}
      </div>
      <div class="grid-2">
        <div class="stack" style="--gap:20px">
          <div class="card">
            <div class="card-head"><h3>Solicitudes por revisar</h3><a href="#reservas" class="small" style="color:var(--brand);font-weight:600" data-tab="pendiente">Ver todas</a></div>
            ${pend.length ? pend.map((r) => { const c = cust(r.cliente), vv = veh(r.vehiculo); const urgent = new Date(r.expira) - now < 6 * 3600000; return `
              <div class="list-item" data-res="${r.id}">
                <div class="mini-car">${RR.carSVG(vv.tipo, vv.color)}</div>
                <div class="grow"><div class="cell-main">${r.nueva ? '<span class="new-dot"></span>' : ""}${esc(c.nombre)} <span class="subtle small">· ${r.codigo}</span></div>
                  <div class="cell-sub">${vname(vv)} · ${RR.fmtDate(r.inicio)} → ${RR.fmtDate(r.fin)} · ${RR.ORIGIN[r.origen]}</div></div>
                <div style="text-align:right">${verifBadge(c)}<div class="xs ${urgent ? "" : "subtle"}" style="margin-top:4px;${urgent ? "color:var(--danger);font-weight:600" : ""}">Vence ${RR.relTime(r.expira)}</div></div>
              </div>`; }).join("") : '<div class="empty">No hay solicitudes pendientes 🎉</div>'}
          </div>
          <div class="card">
            <div class="card-head"><h3>Alertas</h3><span class="badge ${al.length ? "b-warn" : "b-ok"}">${al.length}</span></div>
            ${al.length ? al.map((a) => `<div class="alert-row" ${a.res ? `data-res="${a.res}"` : ""} ${a.conv ? `data-conv="${a.conv}"` : ""} ${a.veh ? `data-veh="${a.veh}"` : ""} ${a.go ? `data-go="${a.go}"` : ""} style="cursor:pointer;color:${a.type === "err" ? "var(--danger)" : a.type === "warn" ? "var(--warn)" : "var(--info)"}">${I.alert}<span style="color:var(--text)">${esc(a.text)}</span></div>`).join("") : '<div class="empty">Sin alertas</div>'}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Agenda · próximos 7 días</h3><a href="#calendario" class="small" style="color:var(--brand);font-weight:600">Calendario</a></div>
            ${agenda.length ? agenda.map((g) => `<div class="agenda-day">${RR.sameDay(g.day, new Date()) ? "Hoy" : RR.sameDay(g.day, RR.addDays(new Date(), 1)) ? "Mañana" : RR.fmtDateLong(g.day)}</div>
              ${g.evs.map((e) => `<div class="ev" data-res="${e.r.id}"><span class="t">${RR.fmtTime(e.t)}</span><span class="k ${e.k}">${e.k === "out" ? "↑" : "↓"}</span><div class="grow"><div class="small bold">${e.k === "out" ? "Entrega" : "Devolución"} · ${vname(veh(e.r.vehiculo))}</div><div class="xs subtle">${esc(cust(e.r.cliente).nombre)}${e.r.estado === "pendiente" ? " · sin confirmar" : ""}</div></div></div>`).join("")}`).join("") + '<div style="height:10px"></div>' : '<div class="empty">Sin movimientos</div>'}
          </div>
          <div class="card">
            <div class="card-head"><h3>Estado de la flota</h3><a href="#vehiculos" class="small" style="color:var(--brand);font-weight:600">Gestionar</a></div>
            ${S.vehicles.filter((x) => x.estado !== "inactivo").map((x) => { const pa = peorAlerta(x.id); return `<div class="list-item" style="padding:8px 20px" data-veh="${x.id}"><div class="mini-car" style="width:48px">${RR.carSVG(x.tipo, x.color)}</div><div class="grow"><div class="small bold">${esc(vname(x))}</div><div class="xs subtle">${esc(x.placa)}${pa ? ` · <span style="color:${pa.nivel === "vencido" ? "var(--danger)" : "var(--warn)"}">${NIVEL[pa.nivel][0]}</span>` : ""}</div></div>${x.modalidad === "uber" ? modBadge(x) : RR.badge(RR.VEH_STATUS, RR.vehicleStatus(x))}</div>`; }).join("")}
          </div>
        </div>
      </div>`;
    $$("[data-go]", v).forEach((el) => el.addEventListener("click", () => { const [view, tab] = el.dataset.go.split(":"); if (tab) state.resTab = tab; location.hash = view; }));
    $$("[data-tab]", v).forEach((el) => el.addEventListener("click", () => (state.resTab = el.dataset.tab)));
    bindOpeners(v);
  }

  function bindOpeners(root) {
    $$("[data-res]", root).forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); openReservation(el.dataset.res); }));
    $$("[data-conv]", root).forEach((el) => el.addEventListener("click", () => { state.convSel = el.dataset.conv; location.hash = "conversaciones"; }));
    $$("[data-cli]", root).forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); openCustomer(el.dataset.cli); }));
    $$("[data-veh]", root).forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); openVehicleHistory(el.dataset.veh); }));
  }

  /* =================== RESERVAS =================== */
  const RES_TABS = [
    ["todas", "Todas", () => true],
    ["pendiente", "Pendientes", (r) => r.estado === "pendiente"],
    ["aprobada", "Confirmadas", (r) => r.estado === "aprobada"],
    ["en_curso", "En curso", (r) => r.estado === "en_curso"],
    ["historial", "Historial", (r) => ["finalizada", "rechazada", "vencida", "cancelada"].includes(r.estado)],
  ];
  function viewReservas(v) {
    const tab = RES_TABS.find((t) => t[0] === state.resTab) || RES_TABS[0];
    const q = state.resQ.toLowerCase();
    const rows = S.reservations.filter(tab[2]).filter((r) => !q || [r.codigo, cust(r.cliente).nombre, vname(veh(r.vehiculo)), veh(r.vehiculo).placa].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.estado === "pendiente") - (a.estado === "pendiente") || new Date(b.inicio) - new Date(a.inicio));
    v.innerHTML = `<div class="card">
      <div class="tabs" style="padding:0 12px">${RES_TABS.map(([k, l, f]) => `<button data-t="${k}" class="${state.resTab === k ? "active" : ""}">${l}<span class="count">${S.reservations.filter(f).length}</span></button>`).join("")}</div>
      <div class="toolbar"><div class="search-in">${I.search}<input class="input" id="resQ" placeholder="Buscar por código, cliente, vehículo o placa" value="${esc(state.resQ)}"></div><span class="grow"></span><span class="xs subtle">${rows.length} resultados</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Código</th><th>Cliente</th><th>Vehículo</th><th>Recogida</th><th>Devolución</th><th>Total</th><th>Origen</th><th>Requisitos</th><th>Estado</th></tr></thead>
        <tbody>${rows.map((r) => { const c = cust(r.cliente), vv = veh(r.vehiculo); return `<tr class="clickable" data-res="${r.id}">
          <td class="cell-main mono">${r.nueva ? '<span class="new-dot"></span>' : ""}${r.codigo}</td>
          <td><div class="cell-main">${esc(c.nombre)}</div><div class="cell-sub">${esc(c.tel || "")}</div></td>
          <td><div>${vname(vv)}</div><div class="cell-sub">${vv.placa || ""}</div></td>
          <td class="small">${RR.fmtDT(r.inicio)}</td><td class="small">${RR.fmtDT(r.fin)}</td>
          <td class="mono small">${RR.money(r.total)}</td>
          <td><span class="badge plain b-neutral">${RR.ORIGIN[r.origen]}</span></td>
          <td>${verifBadge(c)}</td>
          <td>${RR.badge(RR.RES_STATUS, r.estado)}${r.estado === "pendiente" && r.expira ? `<div class="xs subtle" style="margin-top:3px">vence ${RR.relTime(r.expira)}</div>` : ""}</td>
        </tr>`; }).join("")}</tbody></table>
        ${rows.length ? "" : '<div class="empty">No hay reservas en esta vista.</div>'}
      </div></div>`;
    $$("[data-t]", v).forEach((b) => b.addEventListener("click", () => { state.resTab = b.dataset.t; viewReservas(v); }));
    const qi = $("#resQ", v);
    qi.addEventListener("input", () => { state.resQ = qi.value; const pos = qi.selectionStart; viewReservas(v); const n = $("#resQ", v); n.focus(); n.setSelectionRange(pos, pos); });
    bindOpeners(v);
  }

  /* ---------- Componente: checklist de verificación ---------- */
  function verifChecklist(c, editable) {
    return `<div>${RR.reqItems().map((it) => { const val = (c.verif || {})[it.key] || "pendiente"; return `<div class="verif-row"><span>${it.label}${it.key === "edad" && c.edad ? ` <span class="subtle small">(${c.edad} años, declarado)</span>` : ""}${it.key === "licencia" && c.licencia ? ` <span class="subtle small">(${c.licencia}${c.licVence ? ", vence " + RR.fmtDate(c.licVence, { month: "short", year: "numeric" }) : ""})</span>` : ""}</span>
      <span class="tri" data-verif="${it.key}">${["verificado", "pendiente", "rechazado"].map((s) => `<button class="${s} ${val === s ? "on" : ""}" data-v="${s}" ${editable ? "" : "disabled"}>${RR.VERIF[s].label}</button>`).join("")}</span></div>`; }).join("")}</div>`;
  }
  function bindVerif(root, c, onChange) {
    $$("[data-verif]", root).forEach((grp) => $$("button", grp).forEach((b) => b.addEventListener("click", () => {
      if (!isAdmin() || b.disabled) return;
      const k = grp.dataset.verif;
      if (c.verif[k] === b.dataset.v) return;
      act("verificar", { clienteId: c.id, clave: k, valor: b.dataset.v }).then((r) => r && onChange());
    })));
  }

  const notaAlerta = (r) => /otro celular/.test(r.notas || "") ? `<div class="callout warn" style="margin-top:10px">${I.alert}<span>Esta solicitud llegó desde un celular distinto al registrado. Confirma que es la misma persona (por ejemplo, llamando al número registrado) antes de aprobar.</span></div>` : "";

  /* ---------- Drawer de reserva ---------- */
  function openReservation(id) {
    let r = RR.get.reservation(id); if (!r) return;
    if (r.nueva) { r.nueva = false; RR.api("/api/admin/accion", { tipo: "vista", id }).catch(() => {}); }
    const d = RR.openModal(`<div id="dr"></div>`, { drawer: true, onClose: refresh });
    const root = $("#dr", d.el);
    function draw() {
      r = RR.get.reservation(id) || r;
      const c = cust(r.cliente), vv = veh(r.vehiculo), ov = RR.verifOverall(c);
      const canApprove = isAdmin() && ov === "verificado";
      const conv = S.conversations.find((k) => k.reserva === r.id);
      root.innerHTML = `
        <div class="drawer-head"><div><div class="row" style="gap:10px"><h2 style="font-size:20px" class="mono">${r.codigo}</h2>${RR.badge(RR.RES_STATUS, r.estado)}</div><div class="small muted" style="margin-top:4px">Origen: ${RR.ORIGIN[r.origen]} · creada ${RR.relTime(r.creado)}</div></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
        <div class="drawer-body">
          ${r.estado === "pendiente" && r.expira ? `<div class="callout warn" style="margin-bottom:18px">${I.clock}<span>Pre-reserva: el vehículo queda bloqueado hasta el <b>${RR.fmtDT(r.expira)}</b> (${RR.relTime(r.expira)}). Si no se aprueba, se libera automáticamente.</span></div>` : ""}
          <div class="dsec"><h4>Vehículo y fechas</h4>
            <div class="row" style="gap:14px;margin-bottom:12px"><div style="width:110px">${RR.carSVG(vv.tipo, vv.color)}</div><div><b>${vname(vv)}</b> · ${vv.anio || ""}<div class="row" style="margin-top:6px"><span class="plate">${vv.placa || ""}</span>${vv.modalidad === "agencia" ? modBadge(vv) : ""}</div></div></div>
            <dl class="kv"><dt>Recogida</dt><dd>${RR.fmtDT(r.inicio)}</dd><dt>Devolución</dt><dd>${RR.fmtDT(r.fin)}</dd><dt>Lugar</dt><dd>${esc(r.lugar)}</dd><dt>Total</dt><dd>${RR.money(r.total)} <span class="subtle small">(${r.dias} d × ${RR.money(r.precioDia)})</span></dd><dt>Depósito</dt><dd>${RR.money(r.deposito)}</dd>${r.notas ? `<dt>Notas</dt><dd>${esc(r.notas)}</dd>` : ""}</dl>
          </div>
          <div class="dsec"><h4>Cliente</h4>
            <div class="row" style="gap:12px">${avatar(c.nombre)}<div class="grow"><div class="row" style="gap:8px"><b>${esc(c.nombre)}</b>${tipoBadge(c)}</div><div class="small muted">${esc(maskDoc(c.doc) || "Sin documento")} · ${esc(c.tel || "")}</div></div><button class="btn btn-sm" data-cli="${c.id}">Ver ficha</button></div>
            ${conv ? `<button class="btn btn-sm btn-ghost" style="margin-top:8px" data-conv="${conv.id}">${I.chat}Ver conversación de WhatsApp</button>` : ""}
          </div>
          <div class="dsec"><div class="row between" style="margin-bottom:10px"><h4 style="margin:0">Validación de requisitos</h4>${verifBadge(c)}</div>
            ${verifChecklist(c, isAdmin() && ["pendiente", "aprobada"].includes(r.estado))}
            ${isAdmin() && r.estado === "pendiente" && RR.reqItems().some((it) => ((c.verif || {})[it.key] || "pendiente") === "pendiente") ? `<button class="btn btn-sm" id="aVerifTodos" style="margin-top:10px">${I.check}Marcar todos los pendientes como verificados</button>` : ""}
            ${notaAlerta(r)}
            ${!isAdmin() ? `<p class="xs subtle" style="margin-top:8px">Solo el administrador puede verificar requisitos y ver documentos.</p>` : ""}
            ${c.docs && Object.keys(c.docs).length ? `<div class="row wrap" style="margin-top:10px">${Object.entries(c.docs).map(([k, n]) => `<button class="btn btn-sm" data-doc="${esc(n)}">${I.doc}${esc(k)}: ${esc(n)}</button>`).join("")}</div>` : `<p class="xs subtle" style="margin-top:8px">${I.doc.replace("<svg", '<svg width="12" height="12" style="display:inline;vertical-align:-1px"')} El cliente aún no ha cargado documentos.</p>`}
          </div>
          <div class="dsec"><h4>Historial</h4><div class="timeline">${r.historial.slice().reverse().map((h) => `<div class="ti"><div>${esc(h.texto)}</div><div class="xs subtle">${esc(h.actor)} · ${RR.fmtDT(h.fecha)}</div></div>`).join("")}</div></div>
        </div>
        <div class="drawer-foot" id="drFoot"></div>`;

      const foot = $("#drFoot", root);
      const btn = (id, cls, label, dis) => `<button class="btn ${cls}" id="${id}" ${dis ? "disabled" : ""}>${label}</button>`;
      if (r.estado === "pendiente") {
        foot.innerHTML = (!canApprove ? `<div class="callout ${ov === "rechazado" ? "err" : "warn"}" style="width:100%">${I.shield}<span>${!isAdmin() ? "Solo el administrador puede aprobar reservas." : ov === "rechazado" ? "Hay requisitos rechazados. Esta solicitud no debería aprobarse." : "Para aprobar, todos los requisitos deben estar <b>verificados</b>. La IA nunca aprueba automáticamente."}</span></div>` : "") +
          btn("aApprove", "btn-success", `${I.check}Aprobar`, !canApprove) + (isAdmin() && !canApprove && ov === "pendiente" ? btn("aForce", "", `${I.shield}Aprobar de todas formas…`) : "") + btn("aReject", "btn-danger", `${I.x}Rechazar`) + btn("aDates", "", `${I.cal}Modificar fechas`) + btn("aExtend", "btn-ghost", "+24 h de plazo");
      } else if (r.estado === "aprobada") {
        foot.innerHTML = btn("aDeliver", "btn-primary", `${I.arrow}Registrar entrega`) + btn("aDates", "", `${I.cal}Modificar fechas`) + btn("aCancel", "btn-danger", "Cancelar");
      } else if (r.estado === "en_curso") {
        foot.innerHTML = btn("aReturn", "btn-success", `${I.check}Registrar devolución`) + btn("aDates", "", `${I.cal}Extender / modificar`);
      } else foot.innerHTML = `<span class="small muted">Reserva cerrada.${isAdmin() ? "" : " No admite cambios."}</span>`;
      if (isAdmin()) foot.insertAdjacentHTML("beforeend", btn("aEdit", "btn-ghost", `${I.edit}Editar todo`));

      const on = (sel, fn) => { const el = $(sel, root); el && el.addEventListener("click", fn); };
      on("#aVerifTodos", () => act("verificar_todos", { clienteId: c.id }).then((x) => { if (x) { RR.toast(x.marcados.length ? `Verificados: ${x.marcados.join(", ")}` : "No había pendientes"); draw(); } }));
      on("#aForce", () => {
        const faltan = RR.reqItems().filter((it) => (c.verif || {})[it.key] !== "verificado").map((it) => it.label);
        const m = RR.openModal(`<div class="modal-head"><h2>Aprobar sin completar requisitos</h2></div>
          <div class="modal-body stack"><p class="muted">Faltan por verificar: <b>${faltan.map(esc).join(", ")}</b>. La aprobación quedará registrada a tu nombre con el motivo.</p>
          <div class="field"><label for="fzMot">Motivo</label><textarea class="textarea" id="fzMot" placeholder="Ej.: cliente conocido, revisé la cédula en la oficina"></textarea></div></div>
          <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-success" id="fzOk" disabled>Aprobar</button></div>`);
        m.el.querySelector(".modal").style.maxWidth = "480px";
        const t = $("#fzMot", m.el);
        t.addEventListener("input", () => ($("#fzOk", m.el).disabled = t.value.trim().length < 5));
        $("#fzOk", m.el).addEventListener("click", async () => { const x = await act("aprobar", { id: r.id, forzar: true, motivo: t.value.trim() }, `${r.codigo} aprobada`); if (x) { m.close(); draw(); } });
      });
            on("#aApprove", () => act("aprobar", { id: r.id }, `${r.codigo} aprobada`).then((x) => x && draw()));
      on("#aReject", () => rejectModal(r, draw));
      on("#aDates", () => datesModal(r, draw));
            on("#aExtend", () => act("extender", { id: r.id }, "Plazo extendido 24 h").then((x) => x && draw()));
            on("#aDeliver", () => act("entregar", { id: r.id }, "Entrega registrada").then((x) => x && draw()));
            on("#aReturn", () => act("devolver", { id: r.id }, "Devolución registrada · alquiler finalizado").then((x) => x && draw()));
            on("#aCancel", () => RR.confirm(`Cancelar ${r.codigo}`, "El vehículo queda libre para esas fechas. Esta acción queda registrada en la auditoría.", "Cancelar reserva", () => act("cancelar", { id: r.id }, "Reserva cancelada").then((x) => x && draw()), true));
      on("#aEdit", () => editReservation(r, (borrada) => (borrada ? d.close() : draw())));
      bindVerif(root, c, draw);
      $$("[data-cli]", root).forEach((el) => el.addEventListener("click", () => { d.close(); openCustomer(el.dataset.cli); }));
      $$("[data-conv]", root).forEach((el) => el.addEventListener("click", () => { d.close(); state.convSel = el.dataset.conv; location.hash = "conversaciones"; }));
      $$("[data-close]", root).forEach((b) => b.addEventListener("click", d.close));
    }
    draw();
  }

  function rejectModal(r, after) {
    const m = RR.openModal(`<div class="modal-head"><h2>Rechazar ${r.codigo}</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack"><div class="field"><label>Motivo</label><select class="select" id="rjM"><option>No cumple requisitos</option><option>Documentos inválidos o ilegibles</option><option>Vehículo no disponible</option><option>El cliente desistió</option><option>Otro</option></select></div>
      <div class="field"><label>Mensaje para el cliente (opcional)</label><textarea class="textarea" id="rjT" placeholder="Se enviará por WhatsApp cuando esté conectado"></textarea></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-danger" id="rjOk" style="border-color:var(--danger)">Rechazar solicitud</button></div>`);
    $("#rjOk", m.el).addEventListener("click", async () => { const x = await act("rechazar", { id: r.id, motivo: $("#rjM", m.el).value }, `${r.codigo} rechazada · vehículo liberado`); if (x) { m.close(); after(); } });
  }

  function datesModal(r, after) {
    const vv = veh(r.vehiculo);
    const m = RR.openModal(`<div class="modal-head"><h2>Modificar fechas · ${r.codigo}</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack"><div class="form-grid">
        <div class="field"><label>Recogida</label><input class="input" type="datetime-local" id="mdA" value="${RR.toLocalInput(r.inicio)}"></div>
        <div class="field"><label>Devolución</label><input class="input" type="datetime-local" id="mdB" value="${RR.toLocalInput(r.fin)}"></div></div>
        <div id="mdMsg"></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="mdOk">Guardar cambios</button></div>`);
    const check = () => {
      const a = new Date($("#mdA", m.el).value), b = new Date($("#mdB", m.el).value);
      let html, ok = false;
      if (!(b > a)) html = `<div class="callout err">${I.alert}La devolución debe ser posterior a la recogida.</div>`;
      else { const c = RR.conflicts(vv.id, a.toISOString(), b.toISOString(), r.id); if (c.length) html = `<div class="callout err">${I.alert}<span>Conflicto con ${c.map((x) => `<b>${x.codigo}</b> (${RR.fmtDate(x.inicio)} → ${RR.fmtDate(x.fin)})`).join(", ")}. No se permiten reservas duplicadas.</span></div>`; else { ok = true; const dd = RR.days(a, b); html = `<div class="callout ok">${I.check}<span>Disponible · ${dd} días · nuevo total <b>${RR.money(dd * r.precioDia)}</b></span></div>`; } }
      $("#mdMsg", m.el).innerHTML = html; $("#mdOk", m.el).disabled = !ok; return ok;
    };
    $("#mdA", m.el).addEventListener("change", check); $("#mdB", m.el).addEventListener("change", check); check();
    $("#mdOk", m.el).addEventListener("click", async () => {
      if (!check()) return;
      const a = new Date($("#mdA", m.el).value).toISOString(), b = new Date($("#mdB", m.el).value).toISOString();
      const x = await act("fechas", { id: r.id, inicio: a, fin: b }, "Fechas actualizadas");
      if (x) { m.close(); after(); }
    });
  }

  /* ---------- Nueva reserva manual ---------- */
  function newReservation(pre = {}) {
    const a0 = pre.inicio ? new Date(pre.inicio) : RR.addDays(today(), 1); if (!pre.inicio) a0.setHours(9);
    const b0 = pre.fin ? new Date(pre.fin) : RR.addDays(a0, 2);
    const m = RR.openModal(`<div class="modal-head"><div><h2>Nueva reserva manual</h2><p class="small muted" style="margin-top:4px">Para clientes que llaman o llegan a la oficina.</p></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack">
        <div class="form-grid">
          <div class="field"><label>Recogida</label><input class="input" type="datetime-local" id="nA" value="${RR.toLocalInput(a0)}"></div>
          <div class="field"><label>Devolución</label><input class="input" type="datetime-local" id="nB" value="${RR.toLocalInput(b0)}"></div>
          <div class="field full"><label>Vehículo</label><select class="select" id="nV"></select></div>
          <div class="field full"><label>Cliente</label><select class="select" id="nC"><option value="__new">+ Cliente nuevo</option>${S.customers.slice().sort((x, y) => x.nombre.localeCompare(y.nombre)).map((c) => `<option value="${c.id}" ${pre.cliente === c.id ? "selected" : ""}>${esc(c.nombre)} — ${RR.VERIF[RR.verifOverall(c)].label}</option>`).join("")}</select></div>
          <div class="field" data-newc><label>Nombre completo</label><input class="input" id="nN"></div>
          <div class="field" data-newc><label>Documento</label><input class="input" id="nD" placeholder="CC 1.234.567"></div>
          <div class="field" data-newc><label>Celular</label><input class="input" id="nT" placeholder="+57 300 000 0000"></div>
          <div class="field" data-newc><label>Correo</label><input class="input" id="nE" type="email"></div>
          <div class="field full"><label>Lugar de recogida</label><select class="select" id="nL">${RR.BUSINESS.locations.map((l) => `<option>${esc(l)}</option>`).join("")}</select></div>
          <div class="field full"><label>Notas</label><input class="input" id="nO" placeholder="Opcional"></div>
        </div>
        <div id="nMsg"></div>
      </div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="nOk">Crear reserva</button></div>`);
    const E = (s) => $(s, m.el);
    const fillVeh = () => {
      const a = new Date(E("#nA").value), b = new Date(E("#nB").value), cur = E("#nV").value || pre.vehiculo;
      E("#nV").innerHTML = S.vehicles.filter(reservable).map((x) => { const ok = b > a && RR.isAvailable(x, a.toISOString(), b.toISOString()); return `<option value="${x.id}" ${ok ? "" : "disabled"} ${cur === x.id ? "selected" : ""}>${vname(x)} · ${x.placa} · ${RR.money(x.precio)}/día${ok ? "" : x.estado === "mantenimiento" ? " — mantenimiento" : " — ocupado"}</option>`; }).join("");
      if (E("#nV").selectedOptions[0]?.disabled) { const f = [...E("#nV").options].find((o) => !o.disabled); if (f) E("#nV").value = f.value; }
      status();
    };
    const status = () => {
      const c = E("#nC").value === "__new" ? null : cust(E("#nC").value);
      $$("[data-newc]", m.el).forEach((f) => f.classList.toggle("hidden", !!c));
      const x = RR.get.vehicle(E("#nV").value), a = new Date(E("#nA").value), b = new Date(E("#nB").value);
      if (!x || !(b > a)) { E("#nMsg").innerHTML = `<div class="callout err">${I.alert}Revisa las fechas: no hay vehículos disponibles o la devolución es anterior.</div>`; return; }
      const dd = RR.days(a, b), ver = c && RR.verifOverall(c) === "verificado";
      E("#nMsg").innerHTML = `<div class="callout ${ver ? "ok" : "warn"}">${ver ? I.check : I.shield}<span>${dd} días · total <b>${RR.money(dd * x.precio)}</b>. ${ver ? "Cliente verificado: la reserva se crea <b>confirmada</b>." : "El cliente no tiene todos los requisitos verificados: se crea como <b>pre-reserva pendiente</b>."}</span></div>`;
    };
    E("#nA").addEventListener("change", fillVeh); E("#nB").addEventListener("change", fillVeh);
    E("#nV").addEventListener("change", status); E("#nC").addEventListener("change", status);
    if (pre.cliente) E("#nC").value = pre.cliente;
    fillVeh();
    E("#nOk").addEventListener("click", async () => {
      const payload = { vehiculoId: E("#nV").value, inicio: new Date(E("#nA").value).toISOString(), fin: new Date(E("#nB").value).toISOString(), lugar: E("#nL").value, notas: E("#nO").value.trim() };
      if (E("#nC").value === "__new") {
        const nombre = E("#nN").value.trim(), doc = E("#nD").value.trim(), tel = E("#nT").value.trim();
        $$("[data-newc] .input", m.el).forEach((i) => i.classList.remove("invalid"));
        let bad = false;
        if (nombre.split(" ").filter(Boolean).length < 2) { E("#nN").classList.add("invalid"); bad = true; }
        if (doc.length < 5) { E("#nD").classList.add("invalid"); bad = true; }
        if (!/^\+?[0-9 ]{10,16}$/.test(tel)) { E("#nT").classList.add("invalid"); bad = true; }
        if (bad) return RR.toast("Completa nombre, documento y celular válidos", true);
        payload.nuevo = { nombre, documento: doc, telefono: tel, email: E("#nE").value.trim() || undefined };
      } else payload.clienteId = E("#nC").value;
      const btn = E("#nOk"); btn.disabled = true;
      const res = await act("crear_reserva", payload);
      btn.disabled = false;
      if (!res) return;
      m.close(); RR.toast(`${res.codigo} creada`); refresh(); openReservation(res.id);
    });
  }

  /* =================== CALENDARIO =================== */
  function viewCalendario(v) {
    const mode = state.calMode, d0 = state.calDate;
    let label, body;
    if (mode === "semana") {
      const ws = RR.startOfDay(d0); // ventana móvil de 7 días desde la fecha elegida (más útil para alquileres)
      const we = RR.addDays(ws, 7);
      label = `${RR.fmtDate(ws, { day: "numeric", month: "short" })} – ${RR.fmtDate(RR.addDays(we, -1), { day: "numeric", month: "short", year: "numeric" })}`;
      const span = we - ws;
      const days = [...Array(7)].map((_, i) => RR.addDays(ws, i));
      body = `<div class="gantt"><div class="gantt-in">
        <div class="g-row g-head"><div class="g-veh">Vehículo</div><div class="g-track">${days.map((d) => `<div class="${RR.sameDay(d, new Date()) ? "today" : ""}">${d.toLocaleDateString("es-CO", { weekday: "short" })} ${d.getDate()}</div>`).join("")}</div></div>
        ${S.vehicles.filter((x) => reservable(x) && x.estado !== "inactivo").map((x) => {
          const rs = S.reservations.filter((r) => r.vehiculo === x.id && ["pendiente", "aprobada", "en_curso", "finalizada"].includes(r.estado) && new Date(r.inicio) < we && new Date(r.fin) > ws);
          const bars = rs.map((r) => {
            const a = Math.max(0, (new Date(r.inicio) - ws) / span), b = Math.min(1, (new Date(r.fin) - ws) / span);
            return `<div class="bar s-${r.estado}" style="left:calc(${a * 100}% + 2px);width:calc(${(b - a) * 100}% - 4px)" data-res="${r.id}" title="${r.codigo} · ${esc(cust(r.cliente).nombre)} · ${RR.RES_STATUS[r.estado].label}"><b>${esc(cust(r.cliente).nombre.split(" ")[0])} · ${r.codigo}</b><span>${RR.fmtTime(r.inicio)} → ${RR.fmtDate(r.fin)} ${RR.fmtTime(r.fin)}</span></div>`;
          }).join("");
          return `<div class="g-row"><div class="g-veh"><div class="mini-car">${RR.carSVG(x.tipo, x.color)}</div><div><b>${vname(x)}</b><span>${x.placa}</span></div></div>
            <div class="g-track">${days.map((d) => `<div class="col ${RR.sameDay(d, new Date()) ? "today" : ""}" data-slot="${x.id}|${d.toISOString()}"></div>`).join("")}${x.estado === "mantenimiento" ? '<div class="maint">En mantenimiento</div>' : x.estado === "inactivo" ? '<div class="maint">Inactivo</div>' : bars}</div></div>`;
        }).join("")}
      </div></div>`;
    } else if (mode === "mes") {
      const first = new Date(d0.getFullYear(), d0.getMonth(), 1);
      const gs = RR.addDays(first, -((first.getDay() + 6) % 7));
      label = first.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
      label = label[0].toUpperCase() + label.slice(1);
      const cells = [...Array(42)].map((_, i) => RR.addDays(gs, i));
      body = `<div class="month">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((x) => `<div class="dow">${x}</div>`).join("")}
        ${cells.map((d) => { const evs = dayEvents(d); return `<div class="day ${d.getMonth() !== first.getMonth() ? "other" : ""} ${RR.sameDay(d, new Date()) ? "today" : ""}" data-day="${d.toISOString()}"><span class="n">${d.getDate()}</span>
          ${evs.slice(0, 3).map((e) => `<div class="chipev ${e.r.estado === "pendiente" ? "pend" : e.k}" data-res="${e.r.id}">${e.k === "out" ? "↑" : "↓"} ${esc(veh(e.r.vehiculo).modelo)}</div>`).join("")}${evs.length > 3 ? `<span class="more">+${evs.length - 3} más</span>` : ""}</div>`; }).join("")}</div>`;
    } else {
      label = d0.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
      label = label[0].toUpperCase() + label.slice(1);
      const evs = dayEvents(d0);
      const using = S.reservations.filter((r) => ["en_curso", "aprobada"].includes(r.estado) && new Date(r.inicio) < RR.addDays(d0, 1) && new Date(r.fin) > d0);
      body = `<div class="grid-2" style="padding:16px;gap:16px">
        <div class="card"><div class="card-head"><h3>Entregas y devoluciones</h3><span class="badge b-neutral">${evs.length}</span></div>
          ${evs.length ? evs.map((e) => `<div class="ev" data-res="${e.r.id}"><span class="t">${RR.fmtTime(e.t)}</span><span class="k ${e.k}">${e.k === "out" ? "↑" : "↓"}</span><div class="grow"><div class="small bold">${e.k === "out" ? "Entrega" : "Devolución"} · ${vname(veh(e.r.vehiculo))}</div><div class="xs subtle">${esc(cust(e.r.cliente).nombre)} · ${esc(e.k === "out" ? e.r.lugar : e.r.devolucion)}</div></div>${RR.badge(RR.RES_STATUS, e.r.estado)}</div>`).join("") + '<div style="height:8px"></div>' : '<div class="empty">Sin entregas ni devoluciones este día.</div>'}</div>
        <div class="card"><div class="card-head"><h3>Vehículos comprometidos</h3><span class="badge b-neutral">${using.length}/${S.vehicles.filter(reservable).length}</span></div>
          ${using.length ? using.map((r) => `<div class="list-item" data-res="${r.id}"><div class="mini-car" style="width:52px">${RR.carSVG(veh(r.vehiculo).tipo, veh(r.vehiculo).color)}</div><div class="grow"><div class="small bold">${vname(veh(r.vehiculo))}</div><div class="xs subtle">${esc(cust(r.cliente).nombre)} · hasta ${RR.fmtDT(r.fin)}</div></div></div>`).join("") : '<div class="empty">Toda la flota libre.</div>'}</div>
      </div>`;
    }
    const upcoming = S.reservations.filter((r) => r.estado === "aprobada" && new Date(r.inicio) > new Date() && new Date(r.inicio) - new Date() < 48 * 3600000).length;
    v.innerHTML = `<div class="card">
      <div class="cal-head">
        <div class="seg">${[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, l]) => `<button data-m="${k}" class="${mode === k ? "active" : ""}">${l}</button>`).join("")}</div>
        <div class="row"><button class="btn btn-sm btn-icon" id="cPrev" aria-label="Anterior">${I.back}</button><button class="btn btn-sm" id="cToday">Hoy</button><button class="btn btn-sm btn-icon" id="cNext" aria-label="Siguiente">${I.arrow}</button></div>
        <div class="lbl">${label}</div>
        <span class="grow"></span>
        ${upcoming ? `<span class="badge b-info">${upcoming} ${upcoming === 1 ? "entrega" : "entregas"} en las próximas 48 h</span>` : ""}
        <span class="badge b-neutral plain" title="Se conectará en la Etapa 6">Google Calendar: no conectado</span>
      </div>
      ${body}
      <div class="legend"><span><i class="s-en_curso"></i>En curso</span><span><i class="s-aprobada"></i>Confirmada</span><span><i class="s-pendiente"></i>Pre-reserva pendiente</span><span><i class="s-finalizada"></i>Finalizada</span><span class="subtle">${mode === "semana" ? "Haz clic en una celda vacía para crear una reserva." : mode === "mes" ? "Haz clic en un día para ver el detalle." : ""}</span></div>
    </div>`;
    $$("[data-m]", v).forEach((b) => b.addEventListener("click", () => { state.calMode = b.dataset.m; viewCalendario(v); }));
    const step = mode === "semana" ? 7 : mode === "dia" ? 1 : 0;
    $("#cPrev", v).addEventListener("click", () => { state.calDate = step ? RR.addDays(d0, -step) : new Date(d0.getFullYear(), d0.getMonth() - 1, 1); viewCalendario(v); });
    $("#cNext", v).addEventListener("click", () => { state.calDate = step ? RR.addDays(d0, step) : new Date(d0.getFullYear(), d0.getMonth() + 1, 1); viewCalendario(v); });
    $("#cToday", v).addEventListener("click", () => { state.calDate = today(); viewCalendario(v); });
    $$("[data-day]", v).forEach((el) => el.addEventListener("click", () => { state.calDate = RR.startOfDay(el.dataset.day); state.calMode = "dia"; viewCalendario(v); }));
    $$("[data-slot]", v).forEach((el) => el.addEventListener("click", () => { const [vid, iso] = el.dataset.slot.split("|"); const a = new Date(iso); a.setHours(9); if (a < new Date()) return RR.toast("No se puede crear una reserva en el pasado", true); newReservation({ vehiculo: vid, inicio: a.toISOString(), fin: RR.addDays(a, 2).toISOString() }); }));
    bindOpeners(v);
  }
  function dayEvents(d) {
    const a = RR.startOfDay(d), b = RR.addDays(a, 1), evs = [];
    S.reservations.forEach((r) => {
      if (!["pendiente", "aprobada", "en_curso", "finalizada"].includes(r.estado)) return;
      if (new Date(r.inicio) >= a && new Date(r.inicio) < b) evs.push({ t: r.inicio, k: "out", r });
      if (new Date(r.fin) >= a && new Date(r.fin) < b) evs.push({ t: r.fin, k: "in", r });
    });
    return evs.sort((x, y) => new Date(x.t) - new Date(y.t));
  }

  /* =================== VEHÍCULOS =================== */
  function viewVehiculos(v) {
    const mods = [["todos", "Toda la flota"], ["alquiler", "Alquiler"], ["uber", "Uber"], ["agencia", "Agencia aliada"]];
    const tabs = [["todos", "Todos"], ["disponible", "Disponibles"], ["reservado", "Reservados"], ["alquilado", "Alquilados"], ["mantenimiento", "Mantenimiento"], ["inactivo", "Inactivos"]];
    const base = S.vehicles.filter((x) => state.vehMod === "todos" || (x.modalidad || "alquiler") === state.vehMod);
    const list = base.filter((x) => state.vehTab === "todos" || RR.vehicleStatus(x) === state.vehTab);
    v.innerHTML = `
      <div class="row between wrap" style="margin-bottom:12px;gap:12px">
        <div class="seg" style="overflow-x:auto;max-width:100%">${mods.map(([k, l]) => `<button data-vm="${k}" class="${state.vehMod === k ? "active" : ""}">${l} <span class="subtle">${k === "todos" ? S.vehicles.length : S.vehicles.filter((x) => (x.modalidad || "alquiler") === k).length}</span></button>`).join("")}</div>
        <div class="row wrap" style="gap:8px">
          <button class="btn btn-sm" id="vFoto">${I.search}¿Quién tenía el carro?</button>
          ${isAdmin() ? `<button class="btn btn-sm" id="vImp">${I.doc}Importar Excel</button><input type="file" id="vImpF" accept=".xlsx,.xls" hidden>` : ""}
          <button class="btn btn-sm" id="vExp">${I.out}Descargar Excel</button>
          ${isAdmin() ? `<button class="btn btn-sm btn-primary" id="addVeh">${I.plus}Agregar vehículo</button>` : ""}
        </div>
      </div>
      <div class="seg" style="overflow-x:auto;max-width:100%;margin-bottom:16px">${tabs.map(([k, l]) => `<button data-vt="${k}" class="${state.vehTab === k ? "active" : ""}">${l} <span class="subtle">${k === "todos" ? base.length : base.filter((x) => RR.vehicleStatus(x) === k).length}</span></button>`).join("")}</div>
      <div class="fleet">${list.map((x) => {
        const st = RR.vehicleStatus(x);
        const next = S.reservations.filter((r) => r.vehiculo === x.id && RR.isBlocking(r) && new Date(r.fin) > new Date()).sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0];
        const als = alertasDe(x.id).filter((a) => a.nivel !== "info");
        const pa = peorAlerta(x.id);
        const fotos = x.fotos || [];
        return `<div class="card"><div class="car-art ${fotos.length ? "con-foto" : ""}">${x.modalidad === "uber" ? modBadge(x) : RR.badge(RR.VEH_STATUS, st)}${fotos.length ? `<img class="car-foto" src="${esc(fotos[0])}" alt="${esc(vname(x))}" loading="lazy"><button class="ver-fotos" data-fotos="${x.id}" aria-label="Ver fotos de ${esc(vname(x))}"></button>${fotos.length > 1 ? `<span class="n-fotos">${fotos.length} fotos</span>` : ""}${(x.fotosPropias || []).length ? "" : '<span class="n-fotos">Foto de Instagram</span>'}` : RR.carSVG(x.tipo, x.color)}</div>
          <div class="body">
            <div class="row between" style="align-items:flex-start"><div class="grow"><b>${esc(vname(x))}</b><div class="xs subtle">${x.codigo ? esc(x.codigo) + " · " : ""}${RR.TYPE_LABEL[x.tipo]} · ${x.anio}${x.colorNombre ? " · " + esc(x.colorNombre) : ""}</div></div><span class="plate">${esc(x.placa)}</span></div>
            ${x.modalidad === "uber"
              ? `<div class="small muted">${I.user.replace("<svg", '<svg width="14" height="14" style="display:inline;vertical-align:-2px"')} ${esc(x.responsable || "Sin conductor fijo")}${x.responsableTel ? " · " + esc(x.responsableTel) : ""}</div>`
              : `<div class="row between"><span class="price" style="font-size:17px">${x.precio ? `${RR.money(x.precio)} <small>/ día</small>` : '<span class="small" style="color:var(--warn)">Sin tarifa</span>'}</span>${x.modalidad === "agencia" ? modBadge(x) : `<span class="xs subtle">Depósito ${RR.money(x.deposito)}</span>`}</div>`}
            ${/^POR-/.test(x.placa) ? `<div class="callout warn" style="padding:8px 10px;font-size:12px">${I.alert}<span>Del Instagram: falta <b>placa, año y tarifa</b>. Edítalo y ponlo «Disponible» para que salga en la página.</span></div>` : ""}
            <div class="xs" style="min-height:18px">${pa ?`<span style="color:${pa.nivel === "vencido" ? "var(--danger)" : "var(--warn)"};font-weight:600">${I.alert.replace("<svg", '<svg width="13" height="13" style="display:inline;vertical-align:-2px"')} ${als.length} alerta(s)</span> <span class="subtle">· ${esc(pa.texto.split(" de ")[0])} ${pa.nivel === "vencido" ? "vencido" : "por vencer"}</span>` : x.soat || x.tecno ? '<span style="color:var(--ok)">Documentos al día</span>' : '<span class="subtle">Sin fechas de documentos</span>'}</div>
            ${x.modalidad !== "uber" ? `<div class="xs muted">${next ? `${st === "alquilado" ? "Regresa" : "Próxima"}: ${st === "alquilado" ? RR.fmtDT(next.fin) : RR.fmtDT(next.inicio)} · ${next.codigo}` : "Sin reservas próximas"}</div>` : ""}
            <div class="row"><button class="btn btn-sm grow" data-edit="${x.id}">${I.edit}${isAdmin() ? "Editar" : "Ver"}</button><button class="btn btn-sm grow" data-hist="${x.id}">${I.clock}Historial</button></div>
          </div></div>`;
      }).join("") || '<div class="empty">Sin vehículos en esta vista.</div>'}</div>`;
    $$("[data-vm]", v).forEach((b) => b.addEventListener("click", () => { state.vehMod = b.dataset.vm; viewVehiculos(v); }));
    $$("[data-vt]", v).forEach((b) => b.addEventListener("click", () => { state.vehTab = b.dataset.vt; viewVehiculos(v); }));
    $$("[data-edit]", v).forEach((b) => b.addEventListener("click", () => vehicleForm(RR.get.vehicle(b.dataset.edit))));
    $$("[data-hist]", v).forEach((b) => b.addEventListener("click", () => openVehicleHistory(b.dataset.hist)));
    $$("[data-fotos]", v).forEach((b) => b.addEventListener("click", () => { const x = RR.get.vehicle(b.dataset.fotos); RR.verFotos(x.fotos, `${vname(x)} · ${x.placa}`); }));
    $("#vFoto", v).addEventListener("click", buscarFotomulta);
    $("#vExp", v).addEventListener("click", exportarVehiculos);
    $("#addVeh", v)?.addEventListener("click", () => vehicleForm(null));
    $("#vImp", v)?.addEventListener("click", () => $("#vImpF", v).click());
    $("#vImpF", v)?.addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importarVehiculos(f); });
  }

  /* ---------- Fotos del vehículo: subir, elegir del Instagram, principal y borrar ---------- */
  // Reduce la foto en el navegador (máx. 1600 px, JPEG) para que suba rápido y no pese en la base de datos.
  function reducirFoto(file) {
    return new Promise((ok, ko) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error(`«${file.name}» no es una imagen que el navegador pueda abrir.`)); };
      img.src = url;
    });
  }
  function editorFotos(root, vid, ro) {
    const pintar = () => {
      const x = RR.get.vehicle(vid); if (!x) return;
      const P = x.fotosPropias || [];
      root.innerHTML = `<div class="fotos-ed">
          ${P.map((f, i) => `<div class="fe"><img src="${esc(f.url)}" alt="Foto ${i + 1}" loading="lazy">${i === 0 ? '<span class="badge b-brand">Principal</span>' : ro ? "" : `<button type="button" class="fe-b" data-fp="${f.id}" title="Usar como principal" aria-label="Usar como principal">★</button>`}${ro ? "" : `<button type="button" class="fe-x" data-fx="${f.id}" title="Borrar foto" aria-label="Borrar foto">${I.x}</button>`}</div>`).join("")}
          ${ro ? "" : `<label class="fe fe-add">${I.plus}<span>Subir fotos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
          <button type="button" class="fe fe-add" data-ig>${I.star}<span>Elegir del Instagram</span></button>`}
        </div>
        <p class="xs subtle" style="margin-top:8px">${P.length ? "La principal es la que sale en el catálogo; el cliente puede ver todas al tocarla." : x.fotos.length ? `Sin fotos propias: en la página se muestra la del Instagram que coincide con «${esc(vname(x))}». Súbele fotos propias para cambiarla.` : "Sin fotos: en la página se muestra la ilustración del carro."} Máximo 8.</p>`;
      if (ro) return;
      $("input[type=file]", root).addEventListener("change", async (e) => {
        const files = [...e.target.files]; e.target.value = "";
        for (const [k, f] of files.entries()) {
          RR.toast(`Subiendo foto ${k + 1} de ${files.length}…`);
          try { const b64 = await reducirFoto(f); if (!(await act("subir_foto", { vehiculoId: vid, formato: "image/jpeg", base64: b64 }))) break; }
          catch (err) { RR.toast(err.message, true); }
        }
        pintar(); refresh();
      });
      $("[data-ig]", root).addEventListener("click", () => elegirDeInstagram(vid, () => { pintar(); refresh(); }));
      $$("[data-fp]", root).forEach((b) => b.addEventListener("click", async () => { if (await act("foto_principal", { id: b.dataset.fp }, "Foto principal cambiada")) { pintar(); refresh(); } }));
      $$("[data-fx]", root).forEach((b) => b.addEventListener("click", async () => { if ((await pregunta("¿Borrar esta foto?", "Se quita del catálogo. No se puede deshacer.", "Borrar", true)) && (await act("borrar_foto", { id: b.dataset.fx }, "Foto borrada"))) { pintar(); refresh(); } }));
    };
    pintar();
  }
  function elegirDeInstagram(vid, despues) {
    const x = RR.get.vehicle(vid);
    const ya = new Set((x.fotosPropias || []).map((f) => f.url));
    const G = S.galeria || [];
    const m = RR.openModal(`<div class="modal-head"><div><h2>Fotos del Instagram</h2><p class="small muted" style="margin-top:4px">Elige la foto de ${esc(vname(x))}.</p></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body">${G.length ? `<div class="ig-pick">${G.map((g) => `<button type="button" data-url="${esc(g.url)}" ${ya.has(g.url) ? "disabled style='opacity:.4'" : ""}><img src="${esc(g.url)}" alt="${esc(g.titulo)}" loading="lazy"><span>${esc(g.titulo)}${ya.has(g.url) ? " · ya está" : ""}</span></button>`).join("")}</div>` : '<div class="empty">No hay fotos en la galería.</div>'}</div>`);
    m.el.querySelector(".modal").style.maxWidth = "760px";
    $$("[data-url]", m.el).forEach((b) => b.addEventListener("click", async () => { if (await act("agregar_foto_galeria", { vehiculoId: vid, url: b.dataset.url }, "Foto agregada")) { m.close(); despues(); } }));
  }

  function vehicleForm(x) {
    const isNew = !x, ro = !isAdmin();
    const d = x || { modalidad: state.vehMod !== "todos" ? state.vehMod : "alquiler", codigo: "", marca: "", modelo: "", anio: new Date().getFullYear(), placa: "", tipo: "sedan", capacidad: 5, maletas: 2, transmision: "Automática", combustible: "Gasolina", color: "#3b4a63", colorNombre: "", precio: 150000, deposito: 700000, estado: "disponible", destacado: "", responsable: "", responsableTel: "", gps: "", gpsRecarga: null, soat: null, tecno: null, seguro: null, aseguradora: "", extintor: null, impuesto: null, km: null, kmAceite: null, agencia: "", comision: null, notas: "" };
    const dis = ro ? "disabled" : "";
    const f = (id, label, val, type = "text", extra = "", cls = "") => `<div class="field ${cls}"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" value="${esc(val ?? "")}" ${dis} ${extra}></div>`;
    const sel = (id, label, opts, val, cls = "") => `<div class="field ${cls}"><label for="${id}">${label}</label><select class="select" id="${id}" ${dis}>${opts.map(([k, l]) => `<option value="${k}" ${k === val ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
    const fecha = (id, label, val) => `<div class="field"><label for="${id}">${label} <span data-st="${id}"></span></label><input class="input" id="${id}" type="date" value="${esc(val || "")}" ${dis}></div>`;
    const sec = (t) => `<h4 class="full" style="margin:8px 0 -4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)">${t}</h4>`;
    const m = RR.openModal(`<div class="modal-head"><div><h2>${isNew ? "Agregar vehículo" : esc(vname(d))}</h2>${ro ? '<p class="small muted" style="margin-top:4px">Solo lectura · el operador no puede modificar la flota.</p>' : ""}</div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack">
        <div class="car-art" id="vfArt" style="border-radius:12px;aspect-ratio:auto;height:130px">${RR.carSVG(d.tipo, d.color)}</div>
        <div><h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3)">Fotos para el catálogo</h4>
          ${isNew ? '<p class="small muted">Guarda el vehículo y luego ábrelo otra vez para agregarle fotos.</p>' : '<div id="vfFotos"></div>'}</div>
        <div class="form-grid">
          ${sec("Vehículo")}
          ${sel("vfMod", "Modalidad / uso", [["alquiler", "Alquiler (catálogo)"], ["uber", "Uber (plataforma)"], ["agencia", "Agencia aliada (comisión)"]], d.modalidad || "alquiler")}${f("vfCod", "ID interno", d.codigo, "text", 'placeholder="VEH-01" maxlength="20"')}
          ${f("vfMarca", "Marca", d.marca)}${f("vfModelo", "Línea", d.modelo)}
          ${f("vfPlaca", "Placa", d.placa, "text", 'placeholder="ABC-123" style="text-transform:uppercase"')}${f("vfAnio", "Modelo (año)", d.anio, "number", 'min="1990" max="2100"')}
          ${sel("vfTipo", "Tipo", Object.entries(RR.TYPE_LABEL), d.tipo)}${f("vfColorN", "Color", d.colorNombre, "text", 'maxlength="40" placeholder="Blanco"')}
          ${f("vfColor", "Color de la ilustración", d.color, "color", 'style="padding:4px;height:42px"')}${f("vfCap", "Puestos", d.capacidad, "number", 'min="1" max="30"')}
          ${f("vfMal", "Maletas", d.maletas, "number", 'min="0" max="20"')}${sel("vfTrans", "Transmisión", [["Automática", "Automática"], ["Mecánica", "Mecánica"]], d.transmision)}
          ${sel("vfComb", "Combustible", [["Gasolina", "Gasolina"], ["Diésel", "Diésel"], ["Híbrido", "Híbrido"], ["Eléctrico", "Eléctrico"], ["Gas", "Gas"]], d.combustible)}${sel("vfEstado", "Estado", [["disponible", "Disponible"], ["mantenimiento", "Mantenimiento"], ["inactivo", "Inactivo"]], d.estado)}
          <div class="full form-grid" data-tarifa style="padding:0;gap:inherit">
            ${sec("Tarifa")}
            ${f("vfPrecio", "Precio por día (COP)", d.precio, "number", 'min="0" step="5000"')}${f("vfDep", "Depósito (COP)", d.deposito, "number", 'min="0" step="50000"')}
            ${f("vfDest", "Etiqueta en el catálogo (opcional)", d.destacado || "", "text", 'maxlength="30" placeholder="Más pedido"')}
          </div>
          <div class="full form-grid" data-agencia style="padding:0;gap:inherit">
            ${sec("Agencia aliada")}
            ${f("vfAg", "Nombre de la agencia", d.agencia, "text", 'maxlength="80"')}${f("vfCom", "Comisión (%)", d.comision ?? "", "number", 'min="0" max="100" step="0.5"')}
          </div>
          ${sec("Responsable y GPS")}
          ${f("vfResp", "Responsable / conductor fijo", d.responsable, "text", 'maxlength="80"')}${f("vfRespT", "WhatsApp del responsable", d.responsableTel, "text", 'maxlength="25" inputmode="tel"')}
          ${f("vfGps", "App GPS / ID del dispositivo", d.gps, "text", 'maxlength="80"')}${fecha("vfSim", "Próxima recarga de la SIM del GPS", d.gpsRecarga)}
          ${sec("Documentos y vencimientos")}
          ${fecha("vfSoat", "Vencimiento SOAT", d.soat)}${fecha("vfTecno", "Vencimiento tecnomecánica", d.tecno)}
          ${fecha("vfSeg", "Vencimiento seguro todo riesgo", d.seguro)}${f("vfAseg", "Aseguradora", d.aseguradora, "text", 'maxlength="60"')}
          ${fecha("vfExt", "Vencimiento extintor", d.extintor)}${fecha("vfImp", "Vencimiento impuesto anual", d.impuesto)}
          ${sec("Kilometraje")}
          ${f("vfKm", "Kilometraje actual (km)", d.km ?? "", "number", 'min="0" step="1"')}${f("vfKmA", "Próximo cambio de aceite (km)", d.kmAceite ?? "", "number", 'min="0" step="500"')}
          <div class="field full"><label for="vfNotas">Notas internas</label><textarea class="textarea" id="vfNotas" maxlength="500" ${dis}>${esc(d.notas || "")}</textarea></div>
          <p class="help full">"Reservado" y "Alquilado" se calculan con las reservas. Los carros de Uber no salen en el catálogo ni se pueden reservar, pero sí reciben alertas.</p>
        </div>
        <div id="vfErr"></div>
      </div>
      <div class="modal-foot">${!isNew && !ro ? `<button class="btn btn-danger" id="vfDel" style="margin-right:auto">Eliminar</button>` : ""}<button class="btn" data-close>${ro ? "Cerrar" : "Cancelar"}</button>${ro ? "" : `<button class="btn btn-primary" id="vfSave">${isNew ? "Agregar" : "Guardar"}</button>`}</div>`);
    m.el.querySelector(".modal").style.maxWidth = "760px";
    const E = (q) => $(q, m.el);
    const art = () => (E("#vfArt").innerHTML = RR.carSVG(E("#vfTipo").value, E("#vfColor").value));
    const modo = () => { const md = E("#vfMod").value; $("[data-tarifa]", m.el).classList.toggle("hidden", md === "uber"); $("[data-agencia]", m.el).classList.toggle("hidden", md !== "agencia"); };
    const estadoDocs = () => $$("[data-st]", m.el).forEach((sp) => (sp.innerHTML = E("#" + sp.dataset.st).value ? docEstado(E("#" + sp.dataset.st).value) : ""));
    E("#vfTipo").addEventListener("change", art); E("#vfColor").addEventListener("input", art); E("#vfMod").addEventListener("change", modo);
    if (!isNew) editorFotos(E("#vfFotos"), x.id, ro);
    $$('input[type="date"]', m.el).forEach((i) => i.addEventListener("change", estadoDocs));
    modo(); estadoDocs();
    if (ro) return;
    E("#vfDel")?.addEventListener("click", async () => {
      const n = S.reservations.filter((r) => r.vehiculo === x.id).length;
      if (n) { RR.toast(`Tiene ${n} reserva(s) en su historial: cámbialo a «Inactivo» para conservar quién lo tuvo (fotomultas).`, true); return; }
      if (await pregunta(`¿Eliminar ${vname(x)} (${x.placa})?`, "Se borra de la flota. No se puede deshacer.", "Eliminar", true) && (await act("borrar_vehiculo", { id: x.id }, "Vehículo eliminado"))) { m.close(); refresh(); }
    });
    E("#vfSave").addEventListener("click", async () => {
      const placa = E("#vfPlaca").value.trim().toUpperCase();
      const n = (q) => (E(q).value === "" ? null : Number(E(q).value));
      const dt = (q) => E(q).value || null;
      const md = E("#vfMod").value;
      const data = {
        modalidad: md, codigo: E("#vfCod").value.trim(), marca: E("#vfMarca").value.trim(), modelo: E("#vfModelo").value.trim(), placa, anio: +E("#vfAnio").value, tipo: E("#vfTipo").value,
        color: E("#vfColor").value, colorNombre: E("#vfColorN").value.trim(), capacidad: +E("#vfCap").value, maletas: +E("#vfMal").value, transmision: E("#vfTrans").value, combustible: E("#vfComb").value,
        precio: md === "uber" ? 0 : +E("#vfPrecio").value || 0, deposito: md === "uber" ? 0 : +E("#vfDep").value || 0, estado: E("#vfEstado").value, destacado: E("#vfDest").value.trim() || null,
        agencia: md === "agencia" ? E("#vfAg").value.trim() : "", comision: md === "agencia" ? n("#vfCom") : null,
        responsable: E("#vfResp").value.trim(), responsableTel: E("#vfRespT").value.trim(), gps: E("#vfGps").value.trim(), gpsRecarga: dt("#vfSim"),
        soat: dt("#vfSoat"), tecno: dt("#vfTecno"), seguro: dt("#vfSeg"), aseguradora: E("#vfAseg").value.trim(), extintor: dt("#vfExt"), impuesto: dt("#vfImp"),
        km: n("#vfKm"), kmAceite: n("#vfKmA"), notas: E("#vfNotas").value.trim(),
      };
      const errs = [];
      if (!data.marca || !data.modelo) errs.push("Marca y línea son obligatorias.");
      if (!/^[A-Z]{3}-?\d{2}[0-9A-Z]$/.test(placa)) errs.push("Placa inválida (formato ABC-123).");
      if (S.vehicles.some((o) => o.placa.replace("-", "") === placa.replace("-", "") && o !== x)) errs.push("Ya existe un vehículo con esa placa.");
      if (md !== "uber" && data.estado === "disponible" && !(data.precio > 0)) errs.push("Para alquilarlo, el precio por día debe ser mayor a 0.");
      if (data.anio < 1990 || data.anio > 2100) errs.push("Año fuera de rango.");
      if (errs.length) { E("#vfErr").innerHTML = `<div class="callout err">${I.alert}<div>${errs.join("<br>")}</div></div>`; return; }
      if (await act("guardar_vehiculo", { id: isNew ? undefined : x.id, data }, isNew ? "Vehículo agregado" : "Cambios guardados")) { m.close(); refresh(); }
    });
  }

  /* =================== CLIENTES =================== */
  function viewClientes(v) {
    const q = state.cliQ.toLowerCase();
    const list = S.customers.filter((c) => !q || [c.nombre, c.doc, c.tel, c.email].join(" ").toLowerCase().includes(q)).sort((a, b) => new Date(b.creado) - new Date(a.creado));
    v.innerHTML = `<div class="card">
      <div class="toolbar"><div class="search-in">${I.search}<input class="input" id="cliQ" placeholder="Buscar por nombre, documento o teléfono" value="${esc(state.cliQ)}"></div><button class="btn btn-sm btn-primary" id="cliNew">${I.plus}Nuevo cliente</button><span class="grow"></span>
        ${["verificado", "pendiente", "rechazado"].map((s) => `<span class="badge ${RR.VERIF[s].cls}">${S.customers.filter((c) => RR.verifOverall(c) === s).length} ${RR.VERIF[s].label.toLowerCase()}s</span>`).join("")}</div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Tipo</th><th>Documento</th><th>Teléfono</th><th>Origen</th><th>Reservas</th><th>Verificación</th><th>Registro</th></tr></thead>
      <tbody>${list.map((c) => { const n = S.reservations.filter((r) => r.cliente === c.id).length; return `<tr class="clickable" data-cli="${c.id}">
        <td><div class="row" style="gap:10px">${avatar(c.nombre)}<div><div class="cell-main">${esc(c.nombre)}</div><div class="cell-sub">${esc(c.email || "—")}</div></div></div></td>
        <td>${tipoBadge(c)}</td>
        <td class="mono small">${esc(maskDoc(c.doc) || "—")}</td><td class="small">${esc(c.tel || "—")}</td>
        <td><span class="badge plain b-neutral">${RR.ORIGIN[c.origen] || "—"}</span></td><td class="mono">${n}</td><td>${verifBadge(c)}</td><td class="small muted">${RR.relTime(c.creado)}</td></tr>`; }).join("")}</tbody></table>
      ${list.length ? "" : '<div class="empty">Sin resultados.</div>'}</div></div>`;
    const qi = $("#cliQ", v);
    qi.addEventListener("input", () => { state.cliQ = qi.value; const p = qi.selectionStart; viewClientes(v); const n = $("#cliQ", v); n.focus(); n.setSelectionRange(p, p); });
    $("#cliNew", v).addEventListener("click", () => customerForm(null, (id) => openCustomer(id)));
    bindOpeners(v);
  }

  /* =================== FLOTA: datos, documentos e historial =================== */
  // RR.confirm usa callback; si se cancela, la promesa simplemente no se resuelve.
  const pregunta = (t, x, ok, danger) => new Promise((res) => RR.confirm(t, x, ok, () => res(true), danger));
  const hoyISO = () => new Date().toLocaleDateString("en-CA");
  const diasA = (iso) => (iso ? Math.round((Date.parse(iso) - Date.parse(hoyISO())) / 86400000) : null);
  const DOCS = [["soat", "SOAT"], ["tecno", "Tecnomecánica"], ["seguro", "Seguro todo riesgo"], ["extintor", "Extintor"], ["impuesto", "Impuesto vehicular"], ["gpsRecarga", "Recarga SIM del GPS"]];
  const NIVEL = { vencido: ["Vencido", "b-danger"], urgente: ["Urgente", "b-warn"], proximo: ["Próximo", "b-info"], info: ["Pico y placa", "b-neutral"] };
  const docEstado = (iso) => {
    const d = diasA(iso);
    if (d === null) return `<span class="badge plain b-neutral">Sin fecha</span>`;
    if (d < 0) return `<span class="badge b-danger">Vencido hace ${-d} d</span>`;
    if (d <= 15) return `<span class="badge b-warn">${d === 0 ? "Vence hoy" : `${d} d`}</span>`;
    if (d <= 30) return `<span class="badge b-info">${d} d</span>`;
    return `<span class="badge b-ok">Al día · ${d} d</span>`;
  };
  const alertasDe = (vid) => (S.alertasFlota || []).filter((a) => a.vehiculo === vid);
  const peorAlerta = (vid) => { const al = alertasDe(vid).filter((a) => a.nivel !== "info"); return al.find((a) => a.nivel === "vencido") || al.find((a) => a.nivel === "urgente") || al[0]; };
  const fechaLarga = (iso) => (iso ? RR.fmtDate(iso + "T12:00:00", { day: "numeric", month: "short", year: "numeric" }) : "—");

  /* ---------- Utilidades de archivos (librerías cargadas solo cuando se usan) ---------- */
  const scripts = {};
  const cargarScript = (src) => (scripts[src] ||= new Promise((ok, ko) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => { delete scripts[src]; ko(new Error("No se pudo cargar un componente. Revisa la conexión a internet.")); };
    document.head.appendChild(s);
  }));
  function descargar(blob, nombre) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- Historial de un vehículo (quién lo tuvo y cuándo) ---------- */
  function openVehicleHistory(id) {
    const x = RR.get.vehicle(id); if (!x) return;
    const rs = S.reservations.filter((r) => r.vehiculo === id).sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
    const d = RR.openModal(`<div class="drawer-head"><div><div class="row" style="gap:8px"><h2 style="font-size:19px">${esc(vname(x))}</h2>${modBadge(x)}</div><div class="row" style="margin-top:6px;gap:8px"><span class="plate">${esc(x.placa)}</span>${x.codigo ? `<span class="xs subtle">${esc(x.codigo)}</span>` : ""}</div></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="drawer-body">
        <div class="dsec"><h4>¿Quién lo tenía? (fotomultas)</h4>
          <div class="row wrap" style="gap:8px"><input class="input" type="datetime-local" id="qhF" style="max-width:240px"><button class="btn btn-sm" id="qhGo">${I.search}Buscar</button></div>
          <div id="qhOut" style="margin-top:10px"></div></div>
        <div class="dsec"><h4>Documentos y vencimientos</h4>
          ${DOCS.map(([k, l]) => `<div class="verif-row"><span>${l}${k === "seguro" && x.aseguradora ? ` <span class="subtle small">(${esc(x.aseguradora)})</span>` : ""}<div class="xs subtle">${fechaLarga(x[k])}</div></span>${docEstado(x[k])}</div>`).join("")}
          <div class="verif-row"><span>Cambio de aceite<div class="xs subtle">${x.km != null ? `${x.km.toLocaleString("es-CO")} km actuales` : "Sin kilometraje"}${x.kmAceite != null ? ` · toca a los ${x.kmAceite.toLocaleString("es-CO")} km` : ""}</div></span>${x.km != null && x.kmAceite != null ? (x.kmAceite - x.km <= 0 ? '<span class="badge b-danger">Atrasado</span>' : x.kmAceite - x.km <= 500 ? `<span class="badge b-warn">${(x.kmAceite - x.km).toLocaleString("es-CO")} km</span>` : `<span class="badge b-ok">${(x.kmAceite - x.km).toLocaleString("es-CO")} km</span>`) : '<span class="badge plain b-neutral">Sin datos</span>'}</div></div>
        <div class="dsec"><h4>Historial de alquileres · ${rs.length}</h4>
          ${rs.length ? rs.map((r) => { const c = cust(r.cliente); return `<div class="list-item" style="padding:10px 0" data-res="${r.id}"><div class="grow"><div class="small bold">${r.codigo} · ${esc(c.nombre)}</div><div class="xs subtle">${RR.fmtDT(r.inicio)} → ${RR.fmtDT(r.fin)}</div><div class="xs subtle">${esc(maskDoc(c.doc) || "Sin documento")} · ${esc(c.tel || "")}</div></div>${RR.badge(RR.RES_STATUS, r.estado)}</div>`; }).join("") : `<div class="empty">${x.modalidad === "uber" ? "Carro de Uber: no tiene alquileres." : "Sin alquileres todavía."}</div>`}</div>
      </div>
      <div class="drawer-foot">${isAdmin() ? `<button class="btn btn-primary" id="vhEdit">${I.edit}Editar vehículo</button>` : ""}</div>`, { drawer: true });
    $("#qhF", d.el).value = RR.toLocalInput(new Date());
    $("#qhGo", d.el).addEventListener("click", () => { $("#qhOut", d.el).innerHTML = quienTenia(x, $("#qhF", d.el).value); bindOpeners($("#qhOut", d.el)); });
    $("#vhEdit", d.el)?.addEventListener("click", () => { d.close(); vehicleForm(x); });
    $$("[data-res]", d.el).forEach((el) => el.addEventListener("click", () => { d.close(); openReservation(el.dataset.res); }));
  }
  /** Busca qué cliente tenía el vehículo en una fecha y hora. */
  function quienTenia(x, local) {
    if (!local) return `<div class="callout warn">${I.alert}<span>Elige la fecha y hora de la fotomulta.</span></div>`;
    const t = new Date(local);
    const r = S.reservations.filter((r) => r.vehiculo === x.id && ["en_curso", "finalizada", "aprobada"].includes(r.estado) && new Date(r.inicio) <= t && new Date(r.fin) > t)[0];
    if (!r) return x.modalidad === "uber"
      ? `<div class="callout">${I.user}<span>No hay alquiler registrado en ese momento. Es un carro de Uber: lo maneja <b>${esc(x.responsable || "su conductor fijo")}</b>${x.responsableTel ? ` (${esc(x.responsableTel)})` : ""}.</span></div>`
      : `<div class="callout ok">${I.check}<span>Nadie lo tenía alquilado el ${RR.fmtDT(t)}: estaba en el negocio.</span></div>`;
    const c = cust(r.cliente);
    return `<div class="callout ${r.estado === "aprobada" ? "warn" : "err"}" data-res="${r.id}" style="cursor:pointer">${I.user}<span>El ${RR.fmtDT(t)} lo tenía <b>${esc(c.nombre)}</b> · ${esc(maskDoc(c.doc) || "sin documento")} · ${esc(c.tel || "")}<br>Reserva <b>${r.codigo}</b> (${RR.fmtDT(r.inicio)} → ${RR.fmtDT(r.fin)})${r.estado === "aprobada" ? " · ojo: la entrega no se registró en el panel" : ""}.</span></div>`;
  }
  function buscarFotomulta() {
    const lista = S.vehicles.slice().sort((a, b) => a.placa.localeCompare(b.placa));
    const m = RR.openModal(`<div class="modal-head"><div><h2>¿Quién tenía el carro?</h2><p class="small muted" style="margin-top:4px">Para fotomultas o comparendos que llegan tiempo después.</p></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack"><div class="form-grid">
        <div class="field"><label for="fmV">Placa</label><select class="select" id="fmV">${lista.map((x) => `<option value="${x.id}">${esc(x.placa)} · ${esc(vname(x))}</option>`).join("")}</select></div>
        <div class="field"><label for="fmF">Fecha y hora de la multa</label><input class="input" type="datetime-local" id="fmF"></div></div>
        <div id="fmOut"></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cerrar</button><button class="btn btn-primary" id="fmGo">${I.search}Buscar</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "560px";
    $("#fmGo", m.el).addEventListener("click", () => { const out = $("#fmOut", m.el); out.innerHTML = quienTenia(RR.get.vehicle($("#fmV", m.el).value), $("#fmF", m.el).value); $$("[data-res]", out).forEach((el) => el.addEventListener("click", () => { m.close(); openReservation(el.dataset.res); })); });
  }

  /* ---------- Importar y exportar la hoja de vehículos (mismas columnas que la plantilla del negocio) ---------- */
  const COLS_EXCEL = [
    ["ID", 9, (x) => x.codigo], ["Modalidad / Uso", 18, (x) => ({ alquiler: "Alquiler (Renta)", uber: "Uber (Plataforma)", agencia: "Agencia aliada" })[x.modalidad || "alquiler"]],
    ["Placa", 11, (x) => x.placa], ["Marca y Línea", 24, (x) => vname(x)], ["Modelo (Año)", 12, (x) => x.anio], ["Color", 12, (x) => x.colorNombre],
    ["Responsable / Conductor Fijo", 26, (x) => x.responsable], ["WhatsApp Responsable", 18, (x) => x.responsableTel], ["App GPS / ID Dispositivo", 22, (x) => x.gps],
    ["SIM GPS / Fecha Recarga", 16, (x) => x.gpsRecarga, "fecha"], ["Vencimiento SOAT", 14, (x) => x.soat, "fecha"], ["Días SOAT", 9, (x) => diasA(x.soat), "dias"],
    ["Vencimiento Tecnomecánica", 14, (x) => x.tecno, "fecha"], ["Días Tecno", 9, (x) => diasA(x.tecno), "dias"], ["Vencimiento Seguro Todo Riesgo", 14, (x) => x.seguro, "fecha"],
    ["Aseguradora", 16, (x) => x.aseguradora], ["Días Seguro", 9, (x) => diasA(x.seguro), "dias"], ["Vencimiento Extintor", 14, (x) => x.extintor, "fecha"], ["Días Extintor", 9, (x) => diasA(x.extintor), "dias"],
    ["Vencimiento Impuesto Anual", 14, (x) => x.impuesto, "fecha"], ["Kilometraje Actual (Km)", 14, (x) => x.km], ["Próximo Cambio Aceite (Km)", 14, (x) => x.kmAceite],
    ["Precio por día", 13, (x) => x.precio || null], ["Depósito", 13, (x) => x.deposito || null],
    ["Estado de Alertas", 18, (x) => { const ds = [x.soat, x.tecno, x.seguro, x.extintor].map(diasA).filter((d) => d !== null); if (!ds.length) return "Sin Fechas"; const m = Math.min(...ds); return m < 0 ? "VENCIDO" : m <= 15 ? "URGENTE (<15d)" : m <= 30 ? "PRÓXIMO (<30d)" : "AL DÍA"; }, "alerta"],
  ];
  async function exportarVehiculos() {
    try { await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"); } catch (e) { RR.toast(e.message, true); return; }
    const wb = new window.ExcelJS.Workbook();
    const ws = wb.addWorksheet("Registro_Vehiculos");
    ws.columns = COLS_EXCEL.map(([header, width]) => ({ header, width }));
    const color = { dias: (d) => (d === null ? null : d < 0 ? "FFC7CE" : d <= 15 ? "FFEB9C" : d <= 30 ? "DDEBF7" : "C6EFCE"), alerta: (t) => ({ VENCIDO: "FFC7CE", "URGENTE (<15d)": "FFEB9C", "PRÓXIMO (<30d)": "DDEBF7", "AL DÍA": "C6EFCE" })[t] };
    S.vehicles.slice().sort((a, b) => (a.codigo || a.placa).localeCompare(b.codigo || b.placa)).forEach((x) => {
      const vals = COLS_EXCEL.map(([, , f, t]) => { const v = f(x); return t === "fecha" && v ? new Date(v + "T12:00:00") : v ?? ""; });
      const fila = ws.addRow(vals);
      COLS_EXCEL.forEach(([, , , t], i) => {
        const cell = fila.getCell(i + 1);
        if (t === "fecha") cell.numFmt = "dd/mm/yyyy";
        const c = color[t] && color[t](vals[i] === "" ? null : vals[i]);
        if (c) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + c } };
      });
    });
    ws.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14120E" } }; cell.font = { bold: true, color: { argb: "FFE8B931" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
    ws.getRow(1).height = 32;
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];
    const buf = await wb.xlsx.writeBuffer();
    descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `vehiculos_${hoyISO()}.xlsx`);
    RR.toast(`Hoja con ${S.vehicles.length} vehículo(s) descargada`);
  }
  // Colores aproximados para la ilustración del carro según el color escrito en la hoja.
  const COLOR_HEX = { blanco: "#f1f3f5", negro: "#1f2937", gris: "#9aa3ad", plata: "#c0c4c9", plateado: "#c0c4c9", rojo: "#e5484d", vinotinto: "#8e1b2c", azul: "#2546d8", verde: "#4b7a4b", amarillo: "#e8b931", naranja: "#f08c2e", beige: "#d8c9a8", cafe: "#7a5230", café: "#7a5230", dorado: "#c9a227" };
  async function importarVehiculos(file) {
    let filas;
    try {
      await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      // Hoja "Registro … Vehículos" o la primera que tenga una columna "Placa".
      const nombres = wb.SheetNames.slice().sort((a, b) => /registro|veh/i.test(b) - /registro|veh/i.test(a));
      for (const n of nombres) {
        const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
        const hi = rows.findIndex((r) => r.some((c) => /^placa$/i.test(String(c).trim())));
        if (hi >= 0) { filas = { hoja: n, enc: rows[hi].map((h) => String(h).trim().toLowerCase()), datos: rows.slice(hi + 1) }; break; }
      }
    } catch (e) { RR.toast(e.message || "No se pudo leer el archivo", true); return; }
    if (!filas) { RR.toast("No encontré una hoja con la columna «Placa»", true); return; }
    const col = (re, no) => filas.enc.findIndex((h) => re.test(h) && !(no && no.test(h)));
    const C = {
      codigo: col(/^id$/), modalidad: col(/modalidad|uso/), placa: col(/^placa$/), marca: col(/marca/), anio: col(/modelo|a[ñn]o/), color: col(/^color/),
      responsable: col(/responsable|conductor/, /whatsapp/), tel: col(/whatsapp/), gps: col(/app gps|dispositivo/), sim: col(/sim/), soat: col(/vencimiento soat/),
      tecno: col(/vencimiento tecno/), seguro: col(/vencimiento seguro/), aseguradora: col(/aseguradora/), extintor: col(/vencimiento extintor/), impuesto: col(/impuesto/),
      km: col(/kilometraje/), aceite: col(/aceite/), precio: col(/precio/), deposito: col(/dep[oó]sito/),
    };
    const val = (r, k) => (C[k] >= 0 ? r[C[k]] : "");
    const txt = (r, k) => String(val(r, k) ?? "").trim();
    const p2 = (n) => String(n).padStart(2, "0");
    const fecha = (r, k) => {
      const v = val(r, k);
      if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
      if (typeof v === "number" && v > 20000) { const d = window.XLSX.SSF.parse_date_code(v); return `${d.y}-${p2(d.m)}-${p2(d.d)}`; }
      const s = String(v || "").trim(); let m;
      if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
      if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
      return undefined;
    };
    const num = (r, k) => { const s = String(val(r, k) ?? "").replace(/[^\d]/g, ""); return s ? Number(s) : undefined; };
    let sinPlaca = 0;
    const lista = [];
    for (const r of filas.datos) {
      if (!r.some((c) => String(c).trim())) continue;
      const placa = txt(r, "placa").toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z]{3}-?\d{2}[0-9A-Z]$/.test(placa)) { sinPlaca++; continue; }
      const mod = txt(r, "modalidad").toLowerCase();
      const marcaLinea = txt(r, "marca").split(/\s+/).filter(Boolean);
      const colorN = txt(r, "color");
      const f = {
        placa, codigo: txt(r, "codigo") || undefined, modalidad: /uber|plataforma/.test(mod) ? "uber" : /agencia/.test(mod) ? "agencia" : mod ? "alquiler" : undefined,
        marca: marcaLinea[0], modelo: marcaLinea.slice(1).join(" ") || undefined, anio: num(r, "anio"), colorNombre: colorN || undefined,
        color: COLOR_HEX[colorN.toLowerCase().split(" ")[0]] || undefined, responsable: txt(r, "responsable") || undefined, responsableTel: txt(r, "tel") || undefined,
        gps: txt(r, "gps") || undefined, gpsRecarga: fecha(r, "sim"), soat: fecha(r, "soat"), tecno: fecha(r, "tecno"), seguro: fecha(r, "seguro"),
        aseguradora: txt(r, "aseguradora") || undefined, extintor: fecha(r, "extintor"), impuesto: fecha(r, "impuesto"), km: num(r, "km"), kmAceite: num(r, "aceite"),
        precio: num(r, "precio"), deposito: num(r, "deposito"),
      };
      if (f.anio && (f.anio < 1990 || f.anio > 2100)) delete f.anio;
      Object.keys(f).forEach((k) => f[k] === undefined && delete f[k]);
      lista.push(f);
    }
    if (!lista.length) { RR.toast(sinPlaca ? `La hoja «${filas.hoja}» tiene ${sinPlaca} fila(s) sin placa: llena la columna Placa y vuelve a importar.` : "La hoja está vacía", true); return; }
    const existentes = new Set(S.vehicles.map((x) => x.placa.replace("-", "")));
    const m = RR.openModal(`<div class="modal-head"><div><h2>Importar ${lista.length} vehículo(s)</h2><p class="small muted" style="margin-top:4px">Hoja «${esc(filas.hoja)}» de ${esc(file.name)}</p></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack">
        ${sinPlaca ? `<div class="callout warn">${I.alert}<span>${sinPlaca} fila(s) sin placa válida no se importan.</span></div>` : ""}
        <div class="table-wrap"><table class="table"><thead><tr><th>Placa</th><th></th><th>Modalidad</th><th>Vehículo</th><th>SOAT</th><th>Tecno</th><th>Extintor</th></tr></thead>
        <tbody>${lista.map((f) => `<tr><td class="mono">${esc(f.placa)}</td><td>${existentes.has(f.placa.replace("-", "")) ? '<span class="badge plain b-info">Actualiza</span>' : '<span class="badge plain b-ok">Nuevo</span>'}</td><td class="small">${esc(f.modalidad || "—")}</td><td class="small">${esc([f.marca, f.modelo].filter(Boolean).join(" ") || "—")}</td><td class="small">${fechaLarga(f.soat)}</td><td class="small">${fechaLarga(f.tecno)}</td><td class="small">${fechaLarga(f.extintor)}</td></tr>`).join("")}</tbody></table></div>
        <p class="xs subtle">Los vehículos que ya existen (misma placa) solo actualizan las columnas que traiga la hoja. Los nuevos de alquiler sin precio quedan <b>inactivos</b> hasta que les pongas la tarifa.</p>
      </div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="ivOk">Importar</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "760px";
    $("#ivOk", m.el).addEventListener("click", async () => {
      const r = await act("importar_vehiculos", { filas: lista });
      if (!r) return;
      m.close(); refresh();
      RR.toast(`${r.nuevos} nuevo(s) · ${r.actualizados} actualizado(s)${r.errores.length ? ` · ${r.errores.length} con error` : ""}`, !!r.errores.length);
    });
  }

  /* =================== ALERTAS DE LA FLOTA =================== */
  function viewAlertas(v) {
    const al = S.alertasFlota || [];
    const n = (k) => al.filter((a) => a.nivel === k).length;
    const filtro = state.alTab;
    const lista = al.filter((a) => filtro === "todas" || a.nivel === filtro);
    const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
    const pp = S.settings.picoPlaca || {};
    const uber = S.vehicles.filter((x) => x.modalidad === "uber" && x.estado !== "inactivo");
    const ult = (p) => { const d = p.replace(/\D/g, ""); return d ? Number(d[d.length - 1]) : null; };
    const celAlertas = S.settings.alertasWhatsapp || [];
    v.innerHTML = `
      <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        ${[["vencido", "Vencidos", "alert"], ["urgente", "Urgentes (≤ 15 días)", "clock"], ["proximo", "Próximos (≤ 30 días)", "cal"], ["info", "Pico y placa mañana", "car"]].map(([k, l, ic]) => `<div class="card kpi ${k === "vencido" && n(k) ? "alert" : ""}" data-al="${k}" style="cursor:pointer"><div class="lbl">${I[ic]}${l}</div><div class="val">${n(k)}</div><div class="hint">${k === "info" ? "Carros de Uber" : "SOAT, tecno, seguro, extintor…"}</div></div>`).join("")}
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="tabs" style="padding:0 12px">${[["todas", "Todas"], ["vencido", "Vencidas"], ["urgente", "Urgentes"], ["proximo", "Próximas"], ["info", "Pico y placa"]].map(([k, l]) => `<button data-at="${k}" class="${filtro === k ? "active" : ""}">${l}<span class="count">${k === "todas" ? al.length : n(k)}</span></button>`).join("")}</div>
          ${lista.length ? lista.map((a) => `<div class="alert-row" data-veh="${a.vehiculo}" style="cursor:pointer;align-items:flex-start;color:${a.nivel === "vencido" ? "var(--danger)" : a.nivel === "urgente" ? "var(--warn)" : "var(--info)"}">${I.alert}<span style="color:var(--text)" class="grow">${esc(a.texto)}</span><span class="badge ${NIVEL[a.nivel][1]}">${NIVEL[a.nivel][0]}</span></div>`).join("") : `<div class="empty">${al.length ? "Nada en esta vista." : "Toda la flota está al día. Si no ves alertas, revisa que cada vehículo tenga sus fechas de SOAT, tecnomecánica, seguro y extintor."}</div>`}
          <p class="xs subtle" style="padding:12px 20px">Reglas de la hoja del negocio: vencido, urgente a 15 días o menos, próximo a 30 días o menos. Aceite: urgente a 500 km o menos. Cada alerta nueva llega una sola vez a las notificaciones${celAlertas.length ? ` y por WhatsApp a ${celAlertas.map(esc).join(", ")}` : " (agrega en Ajustes los celulares que deben recibirla por WhatsApp)"}.</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>Pico y placa · carros de Uber</h3><a href="#ajustes" class="small" style="color:var(--brand);font-weight:600">Editar dígitos</a></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Día</th><th>Placas</th><th>Carros con restricción</th></tr></thead>
          <tbody>${DIAS.map((d, i) => { const dg = pp[String(i + 1)] || []; const vs = uber.filter((x) => dg.includes(ult(x.placa))); return `<tr><td class="small bold">${d}</td><td class="mono small">${dg.join(" y ") || "—"}</td><td class="small">${vs.length ? vs.map((x) => `<span class="badge plain b-info" style="margin:2px">${esc(x.codigo || x.placa)} · ${esc(x.placa)}</span>`).join("") : '<span class="subtle">—</span>'}</td></tr>`; }).join("")}</tbody></table></div>
          <p class="xs subtle" style="padding:12px 20px">Cali: lunes a viernes de 6:00 a. m. a 7:00 p. m. El día anterior llega el aviso para programar el mantenimiento. Los dígitos cambian cada semestre: actualízalos en Ajustes.</p>
        </div>
      </div>`;
    $$("[data-at]", v).forEach((b) => b.addEventListener("click", () => { state.alTab = b.dataset.at; viewAlertas(v); }));
    $$("[data-al]", v).forEach((b) => b.addEventListener("click", () => { state.alTab = b.dataset.al; viewAlertas(v); }));
    $$("[data-veh]", v).forEach((el) => el.addEventListener("click", () => openVehicleHistory(el.dataset.veh)));
  }

  /* =================== SERVICIOS CON CONDUCTOR =================== */
  const SERV = { nuevo: ["Esperando conductor", "b-warn"], tomado: ["Tomado", "b-info"], completado: ["Completado", "b-ok"], cancelado: ["Cancelado", "b-neutral"] };
  const servBadge = (s) => `<span class="badge ${SERV[s.estado][1]}">${SERV[s.estado][0]}</span>`;
  function viewServicios(v) {
    const L = S.servicios || [];
    const tab = state.servTab;
    const rows = L.filter((s) => tab === "todos" || s.estado === tab);
    const C = S.conductores || [];
    const activos = C.filter((c) => c.activo).length;
    const aviso = !S.whatsappActivo ? "WhatsApp no está configurado en el servidor: los pedidos quedan aquí y un asesor los asigna."
      : !activos ? "No hay conductores activos: agrégalos abajo para que les lleguen los servicios por WhatsApp." : "";
    v.innerHTML = `
      ${aviso ? `<div class="callout warn" style="margin-bottom:16px">${I.alert}<span>${aviso}</span></div>` : ""}
      <div class="card">
        <div class="tabs" style="padding:0 12px">${[["todos", "Todos"], ["nuevo", "Esperando conductor"], ["tomado", "Tomados"], ["completado", "Completados"], ["cancelado", "Cancelados"]].map(([k, l]) => `<button data-st="${k}" class="${tab === k ? "active" : ""}">${l}<span class="count">${k === "todos" ? L.length : L.filter((s) => s.estado === k).length}</span></button>`).join("")}</div>
        <div class="toolbar"><span class="small muted">El cliente lo pide en el chat o por WhatsApp; el bot se lo envía por WhatsApp a ${activos} conductor(es) y el primero que pulse «Tomar servicio» se lo queda.</span><span class="grow"></span><button class="btn btn-primary btn-sm" id="svNew">${I.plus}Nuevo servicio</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Cuándo</th><th>Cliente</th><th>Recorrido</th><th>Pas.</th><th>Conductor</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map((s) => `<tr>
          <td class="mono cell-main" style="white-space:nowrap">${esc(s.codigo)}<div class="cell-sub">${{ chat: "Chat web", whatsapp: "WhatsApp", manual: "Manual" }[s.canal]}</div></td>
          <td class="small">${RR.fmtDT(s.fecha)}</td>
          <td><div class="cell-main">${esc(s.nombre)}</div><div class="cell-sub">${esc(s.tel)}</div></td>
          <td class="small" style="max-width:260px">${esc(s.origen)} → <b>${esc(s.destino)}</b>${s.notas ? `<div class="xs subtle">${esc(s.notas)}</div>` : ""}</td>
          <td class="mono">${s.pasajeros}</td>
          <td class="small">${s.conductor ? esc(s.conductor) : '<span class="subtle">—</span>'}</td>
          <td>${servBadge(s)}${s.estado === "nuevo" ? `<div class="xs subtle" style="margin-top:3px">${s.enviados ? `Enviado a ${s.enviados} conductor(es)` : "No llegó a ningún conductor"}</div>` : ""}</td>
          <td style="white-space:nowrap;text-align:right"><button class="btn btn-sm" data-sv-edit="${s.id}">${I.edit}Editar</button>${s.estado === "nuevo" ? ` <button class="btn btn-sm btn-ghost" data-sv-pub="${s.id}" title="Enviar otra vez a los conductores">${I.send}</button>` : ""}${isAdmin() ? ` <button class="btn btn-sm btn-ghost btn-icon" data-sv-del="${s.id}" title="Eliminar" aria-label="Eliminar">${I.x}</button>` : ""}</td></tr>`).join("")}</tbody></table>
        ${rows.length ? "" : '<div class="empty">No hay servicios en esta vista.</div>'}</div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>Conductores · ${activos} activo(s)</h3>${isAdmin() ? `<button class="btn btn-sm btn-primary" id="cdNew">${I.plus}Agregar conductor</button>` : ""}</div>
        ${C.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Conductor</th><th>WhatsApp</th><th>Servicios</th><th>Estado</th><th></th></tr></thead>
        <tbody>${C.map((c) => { const n = L.filter((s) => s.conductor === c.nombre && s.estado !== "cancelado").length; return `<tr>
          <td><div class="cell-main">${esc(c.nombre)}</div>${c.notas ? `<div class="cell-sub">${esc(c.notas)}</div>` : ""}</td>
          <td class="small mono">${esc(c.tel)}</td><td class="mono">${n}</td>
          <td><span class="badge ${c.activo ? "b-ok" : "b-neutral"}">${c.activo ? "Recibe servicios" : "Inactivo"}</span></td>
          <td style="white-space:nowrap;text-align:right">${isAdmin() ? `<button class="btn btn-sm btn-ghost" data-cd-test="${c.id}" title="Enviar un mensaje de prueba">${I.send}Probar</button> <button class="btn btn-sm" data-cd-edit="${c.id}">${I.edit}Editar</button> <button class="btn btn-sm btn-ghost btn-icon" data-cd-del="${c.id}" aria-label="Eliminar conductor">${I.x}</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
          : '<div class="empty">Todavía no hay conductores. Agrega su nombre y su número de WhatsApp.</div>'}
        <p class="xs subtle" style="padding:12px 20px">Cada servicio les llega por WhatsApp con el botón «Tomar servicio». El primero que lo pulse recibe los datos del cliente; a los demás les avisamos que ya fue tomado. Para que les llegue aunque no le hayan escrito al negocio en 24 horas, la plantilla «${esc(S.plantillas?.servicio || "servicio_conductor")}» debe estar aprobada en Meta (ver Ajustes).</p>
      </div>`;
    $$("[data-st]", v).forEach((b) => b.addEventListener("click", () => { state.servTab = b.dataset.st; viewServicios(v); }));
    $("#svNew", v).addEventListener("click", () => servicioForm(null));
    $$("[data-sv-edit]", v).forEach((b) => b.addEventListener("click", () => servicioForm(L.find((s) => s.id === b.dataset.svEdit))));
    $$("[data-sv-pub]", v).forEach((b) => b.addEventListener("click", async () => { const x = await act("publicar_servicio", { id: b.dataset.svPub }); if (x) { RR.toast(`Enviado a ${x.enviados} conductor(es)${x.fallidos.length ? ` · ${x.fallidos.length} no lo recibieron` : ""}`, !!x.fallidos.length); refresh(); } }));
    $$("[data-sv-del]", v).forEach((b) => b.addEventListener("click", async () => {
      const s = L.find((x) => x.id === b.dataset.svDel);
      if (await pregunta(`¿Eliminar el servicio ${s.codigo}?`, "Se borra del panel. Los mensajes que ya les llegaron a los conductores no se pueden borrar de su WhatsApp. No se puede deshacer.", "Eliminar", true)) { await act("borrar_servicio", { id: s.id }, "Servicio eliminado"); refresh(); }
    }));
    $("#cdNew", v)?.addEventListener("click", () => conductorForm(null));
    $$("[data-cd-edit]", v).forEach((b) => b.addEventListener("click", () => conductorForm(C.find((c) => c.id === b.dataset.cdEdit))));
    $$("[data-cd-test]", v).forEach((b) => b.addEventListener("click", () => act("probar_conductor", { id: b.dataset.cdTest }, "Mensaje de prueba enviado")));
    $$("[data-cd-del]", v).forEach((b) => b.addEventListener("click", async () => {
      const c = C.find((x) => x.id === b.dataset.cdDel);
      if (await pregunta(`¿Eliminar a ${c.nombre}?`, "Ya no le llegarán servicios. Su historial de servicios se conserva. Si solo quieres pausarlo, márcalo como inactivo.", "Eliminar", true)) { await act("borrar_conductor", { id: c.id }, "Conductor eliminado"); refresh(); }
    }));
  }
  function conductorForm(c) {
    const nuevo = !c;
    const d = c || { nombre: "", tel: "", activo: true, notas: "" };
    const m = RR.openModal(`<div class="modal-head"><h2>${nuevo ? "Agregar conductor" : `Editar · ${esc(c.nombre)}`}</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <form class="modal-body" novalidate><div class="form-grid">
        <div class="field full"><label for="cdN">Nombre</label><input class="input" id="cdN" value="${esc(d.nombre)}" maxlength="80"></div>
        <div class="field"><label for="cdT">WhatsApp</label><input class="input" id="cdT" value="${esc(d.tel)}" inputmode="tel" maxlength="20" placeholder="+57 300 000 0000"></div>
        <div class="field"><label for="cdA">Estado</label><select class="select" id="cdA"><option value="1" ${d.activo ? "selected" : ""}>Recibe servicios</option><option value="0" ${d.activo ? "" : "selected"}>Inactivo</option></select></div>
        <div class="field full"><label for="cdX">Notas (opcional)</label><input class="input" id="cdX" value="${esc(d.notas || "")}" maxlength="300" placeholder="Ej.: maneja la VEH-01, solo fines de semana"></div>
      </div></form>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="cdOk">${nuevo ? "Agregar" : "Guardar"}</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "520px";
    const E = (q) => $(q, m.el);
    E("#cdOk").addEventListener("click", async () => {
      const datos = { nombre: E("#cdN").value.trim(), telefono: E("#cdT").value.trim(), activo: E("#cdA").value === "1", notas: E("#cdX").value.trim() };
      if (datos.nombre.length < 2) return RR.toast("Escribe el nombre del conductor", true);
      if (!/^\+?[0-9 ]{10,16}$/.test(datos.telefono)) return RR.toast("WhatsApp inválido (10 dígitos)", true);
      if (await act("guardar_conductor", { ...(nuevo ? {} : { id: c.id }), ...datos }, nuevo ? "Conductor agregado" : "Conductor actualizado")) { m.close(); refresh(); }
    });
  }
  function servicioForm(s) {
    const nuevo = !s;
    const d = s || { nombre: "", tel: "", origen: "", destino: "", fecha: (() => { const t = new Date(Date.now() + 3600000); t.setMinutes(0); return t.toISOString(); })(), pasajeros: 1, notas: "", estado: "nuevo", conductor: "" };
    const m = RR.openModal(`<div class="modal-head"><div><h2>${nuevo ? "Nuevo servicio con conductor" : `Servicio ${esc(s.codigo)}`}</h2>${nuevo ? '<p class="small muted" style="margin-top:4px">Para pedidos que llegan por teléfono. Se envía por WhatsApp a los conductores.</p>' : ""}</div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <form class="modal-body" id="svF" novalidate><div class="form-grid">
        <div class="field"><label for="svN">Cliente</label><input class="input" id="svN" value="${esc(d.nombre)}" maxlength="120"></div>
        <div class="field"><label for="svT">Celular</label><input class="input" id="svT" value="${esc(d.tel)}" inputmode="tel" maxlength="25"></div>
        <div class="field full"><label for="svO">Recoger en</label><input class="input" id="svO" value="${esc(d.origen)}" maxlength="200" placeholder="Dirección o lugar"></div>
        <div class="field full"><label for="svD">Destino</label><input class="input" id="svD" value="${esc(d.destino)}" maxlength="200"></div>
        <div class="field"><label for="svW">Fecha y hora</label><input class="input" type="datetime-local" id="svW" value="${RR.toLocalInput(d.fecha)}"></div>
        <div class="field"><label for="svP">Pasajeros</label><input class="input" type="number" id="svP" min="1" max="50" value="${d.pasajeros}"></div>
        ${nuevo ? "" : `<div class="field"><label for="svE">Estado</label><select class="select" id="svE">${Object.entries(SERV).map(([k, [l]]) => `<option value="${k}" ${d.estado === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label for="svC">Conductor</label><input class="input" id="svC" value="${esc(d.conductor || "")}" maxlength="80"></div>`}
        <div class="field full"><label for="svX">Notas</label><textarea class="textarea" id="svX" maxlength="500" placeholder="Ida y vuelta, equipaje, paradas…">${esc(d.notas)}</textarea></div>
      </div></form>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="svOk">${nuevo ? "Crear y enviar" : "Guardar"}</button></div>`);
    const E = (q) => $(q, m.el);
    E("#svOk").addEventListener("click", async () => {
      const datos = { nombre: E("#svN").value.trim(), telefono: E("#svT").value.trim(), origen: E("#svO").value.trim(), destino: E("#svD").value.trim(), fecha: new Date(E("#svW").value).toISOString(), pasajeros: +E("#svP").value || 1, notas: E("#svX").value.trim() };
      if (!nuevo) Object.assign(datos, { id: s.id, estado: E("#svE").value, conductor: E("#svC").value.trim() || undefined });
      if (!datos.nombre || datos.telefono.length < 7 || !datos.origen || !datos.destino) return RR.toast("Completa cliente, celular, origen y destino", true);
      const r = await act("guardar_servicio", datos);
      if (!r) return;
      m.close(); refresh();
      RR.toast(nuevo ? (r.publicado ? `${r.codigo} enviado a ${r.enviados} conductor(es)` : `${r.codigo} creado, pero no llegó a ningún conductor`) : "Servicio actualizado", nuevo && !r.publicado);
    });
  }

  /* =================== CLIENTES: crear, editar y eliminar =================== */
  function customerForm(c, after) {
    const nuevo = !c;
    const d = c || { nombre: "", doc: "", tel: "", email: "", fechaNac: "", licencia: "", licVence: "" };
    const m = RR.openModal(`<div class="modal-head"><h2>${nuevo ? "Nuevo cliente" : `Editar · ${esc(c.nombre)}`}</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <form class="modal-body" id="cfF" novalidate><div class="form-grid">
        <div class="field full"><label for="cfN">Nombre completo</label><input class="input" id="cfN" value="${esc(d.nombre)}" maxlength="120"></div>
        <div class="field"><label for="cfD">Documento</label><input class="input" id="cfD" value="${esc(d.doc || "")}" maxlength="20" placeholder="CC 1234567"></div>
        <div class="field"><label for="cfT">Celular</label><input class="input" id="cfT" value="${esc(d.tel || "")}" maxlength="20" placeholder="+57 300 000 0000"></div>
        <div class="field"><label for="cfE">Correo</label><input class="input" type="email" id="cfE" value="${esc(d.email || "")}" maxlength="200"></div>
        <div class="field"><label for="cfB">Fecha de nacimiento</label><input class="input" type="date" id="cfB" value="${esc(d.fechaNac || "")}"></div>
        <div class="field"><label for="cfL">Categoría de licencia</label><select class="select" id="cfL"><option value="">—</option>${["B1", "B2", "B3", "C1", "C2", "C3", "A2"].map((k) => `<option ${d.licencia === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
        <div class="field"><label for="cfV">Vencimiento de la licencia</label><input class="input" type="date" id="cfV" value="${esc(d.licVence || "")}"></div>
      </div></form>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="cfOk">${nuevo ? "Registrar" : "Guardar"}</button></div>`);
    const E = (q) => $(q, m.el);
    E("#cfOk").addEventListener("click", async () => {
      const datos = { nombre: E("#cfN").value.trim(), documento: E("#cfD").value.trim(), telefono: E("#cfT").value.trim(), email: E("#cfE").value.trim(), fechaNac: E("#cfB").value || null, licencia: E("#cfL").value, licVence: E("#cfV").value || null };
      if (datos.nombre.split(" ").filter(Boolean).length < 2) return RR.toast("Escribe nombre y apellido", true);
      if (datos.documento.length < 5) return RR.toast("Documento inválido", true);
      if (!/^\+?[0-9 ]{10,16}$/.test(datos.telefono)) return RR.toast("Celular inválido (10 dígitos)", true);
      const r = await act("guardar_cliente", { ...(nuevo ? {} : { id: c.id }), ...datos }, nuevo ? "Cliente registrado" : "Datos actualizados");
      if (!r) return;
      m.close(); refresh(); after && after(r.id);
    });
  }
  async function borrarCliente(c, close) {
    const n = S.reservations.filter((r) => r.cliente === c.id).length;
    if (!(await pregunta(`¿Eliminar a ${c.nombre}?`, n ? `También se borran sus ${n} reserva(s) del historial (ya no sabrás quién tenía el carro en esas fechas). No se puede deshacer.` : "Se borra el cliente. No se puede deshacer.", "Eliminar", true))) return;
    if (await act("borrar_cliente", { id: c.id, conHistorial: n > 0 }, "Cliente eliminado")) { close && close(); refresh(); }
  }

  /* =================== RESERVAS: edición completa =================== */
  function editReservation(r, after) {
    const opciones = S.vehicles.filter(reservable);
    const lugares = [...new Set([...RR.BUSINESS.locations, r.lugar])];
    const m = RR.openModal(`<div class="modal-head"><h2>Editar ${r.codigo}</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack"><div class="form-grid">
        <div class="field full"><label for="erV">Vehículo</label><select class="select" id="erV">${opciones.map((x) => `<option value="${x.id}" ${x.id === r.vehiculo ? "selected" : ""}>${esc(vname(x))} · ${esc(x.placa)}</option>`).join("")}</select></div>
        <div class="field"><label for="erA">Recogida</label><input class="input" type="datetime-local" id="erA" value="${RR.toLocalInput(r.inicio)}"></div>
        <div class="field"><label for="erB">Devolución</label><input class="input" type="datetime-local" id="erB" value="${RR.toLocalInput(r.fin)}"></div>
        <div class="field full"><label for="erL">Lugar</label><select class="select" id="erL">${lugares.map((l) => `<option ${l === r.lugar ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
        <div class="field"><label for="erP">Tarifa por día (COP)</label><input class="input" type="number" id="erP" min="0" step="5000" value="${r.precioDia}"></div>
        <div class="field"><label for="erD">Depósito (COP)</label><input class="input" type="number" id="erD" min="0" step="50000" value="${r.deposito}"></div>
        <div class="field"><label for="erE">Estado</label><select class="select" id="erE">${Object.entries(RR.RES_STATUS).map(([k, s]) => `<option value="${k}" ${k === r.estado ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
        <div class="field full"><label for="erN">Notas</label><textarea class="textarea" id="erN" maxlength="1000">${esc(r.notas || "")}</textarea></div>
      </div><div id="erMsg"></div></div>
      <div class="modal-foot"><button class="btn btn-danger" id="erDel" style="margin-right:auto">Eliminar reserva</button><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="erOk">Guardar cambios</button></div>`);
    const E = (q) => $(q, m.el);
    const check = () => {
      const a = new Date(E("#erA").value), b = new Date(E("#erB").value);
      const bloquea = ["pendiente", "aprobada", "en_curso"].includes(E("#erE").value);
      let html = "", ok = true;
      if (!(b > a)) { ok = false; html = `<div class="callout err">${I.alert}La devolución debe ser posterior a la recogida.</div>`; }
      else if (bloquea) { const c = RR.conflicts(E("#erV").value, a.toISOString(), b.toISOString(), r.id); if (c.length) { ok = false; html = `<div class="callout err">${I.alert}<span>Se cruza con ${c.map((x) => `<b>${x.codigo}</b>`).join(", ")}.</span></div>`; } }
      if (ok) { const dd = RR.days(a, b); html = `<div class="callout ok">${I.check}<span>${dd} día(s) · nuevo total <b>${RR.money(dd * (+E("#erP").value || 0))}</b></span></div>`; }
      E("#erMsg").innerHTML = html; E("#erOk").disabled = !ok; return ok;
    };
    ["#erV", "#erA", "#erB", "#erP", "#erE"].forEach((q) => E(q).addEventListener("change", check)); check();
    E("#erOk").addEventListener("click", async () => {
      if (!check()) return;
      const x = await act("editar_reserva", { id: r.id, vehiculoId: E("#erV").value, inicio: new Date(E("#erA").value).toISOString(), fin: new Date(E("#erB").value).toISOString(), lugar: E("#erL").value, precioDia: +E("#erP").value || 0, deposito: +E("#erD").value || 0, estado: E("#erE").value, notas: E("#erN").value.trim() }, "Reserva actualizada");
      if (x) { m.close(); after && after(); }
    });
    E("#erDel").addEventListener("click", async () => {
      if (!(await pregunta(`¿Eliminar ${r.codigo}?`, "Se borra la reserva y su historial. Si solo quieres liberar el carro, mejor cancélala. No se puede deshacer.", "Eliminar", true))) return;
      if (await act("borrar_reserva", { id: r.id }, `${r.codigo} eliminada`)) { m.close(); after && after(true); }
    });
  }

  /* =================== USUARIOS DEL PANEL =================== */
  function userForm(x) {
    const nuevo = !x;
    const d = x || { nombre: "", email: "", rol: "operador", activo: true };
    const yo = x && x.id === me.id;
    const m = RR.openModal(`<div class="modal-head"><h2>${nuevo ? "Nuevo usuario del panel" : `Editar · ${esc(x.nombre)}`}</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <form class="modal-body" id="ufF" novalidate><div class="form-grid">
        <div class="field full"><label for="ufN">Nombre</label><input class="input" id="ufN" value="${esc(d.nombre)}" maxlength="80"></div>
        <div class="field full"><label for="ufE">Correo (usuario)</label><input class="input" type="email" id="ufE" value="${esc(d.email)}" maxlength="200" autocomplete="off"></div>
        <div class="field"><label for="ufR">Rol</label><select class="select" id="ufR" ${yo ? "disabled" : ""}><option value="operador" ${d.rol === "operador" ? "selected" : ""}>Operador</option><option value="admin" ${d.rol === "admin" ? "selected" : ""}>Administrador</option></select></div>
        <div class="field"><label for="ufA">Estado</label><select class="select" id="ufA" ${yo ? "disabled" : ""}><option value="1" ${d.activo ? "selected" : ""}>Activo</option><option value="0" ${d.activo ? "" : "selected"}>Inactivo (no puede entrar)</option></select></div>
        <div class="field full"><label for="ufP">${nuevo ? "Contraseña" : "Nueva contraseña (opcional)"}</label><input class="input" type="password" id="ufP" minlength="8" autocomplete="new-password" placeholder="${nuevo ? "Mínimo 8 caracteres" : "Déjala vacía para no cambiarla"}"></div>
      </div></form>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="ufOk">${nuevo ? "Crear usuario" : "Guardar"}</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "520px";
    const E = (q) => $(q, m.el);
    E("#ufOk").addEventListener("click", async () => {
      const clave = E("#ufP").value;
      const datos = { nombre: E("#ufN").value.trim(), email: E("#ufE").value.trim(), rol: E("#ufR").value, activo: E("#ufA").value === "1", ...(clave ? { clave } : {}) };
      if (nuevo && clave.length < 8) return RR.toast("La contraseña debe tener al menos 8 caracteres", true);
      if (await act("guardar_usuario", { ...(nuevo ? {} : { id: x.id }), ...datos }, nuevo ? "Usuario creado" : "Usuario actualizado")) { m.close(); refresh(); }
    });
  }

  function openCustomer(id) {
    let c = RR.get.customer(id); if (!c) return;
    const d = RR.openModal(`<div id="dc"></div>`, { drawer: true, onClose: refresh });
    const root = $("#dc", d.el);
    function draw() {
      c = RR.get.customer(id) || c; // los datos se recargan del servidor después de cada acción
      const rs = S.reservations.filter((r) => r.cliente === c.id).sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
      const alq = rs.filter((r) => ["en_curso", "finalizada"].includes(r.estado));
      root.innerHTML = `<div class="drawer-head"><div class="row" style="gap:12px">${avatar(c.nombre, "width:44px;height:44px;font-size:15px")}<div><h2 style="font-size:18px">${esc(c.nombre)}</h2><div class="row" style="margin-top:4px">${tipoBadge(c)}${verifBadge(c)}<span class="badge plain b-neutral">${RR.ORIGIN[c.origen] || ""}</span></div></div></div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
        <div class="drawer-body">
          <div class="dsec"><h4>Datos personales</h4><dl class="kv">
            <dt>Documento</dt><dd class="mono">${esc(maskDoc(c.doc) || "—")}</dd><dt>Teléfono</dt><dd>${esc(c.tel || "—")}</dd><dt>Correo</dt><dd>${esc(c.email || "—")}</dd>
            <dt>Edad</dt><dd>${c.edad ? c.edad + " años (declarada)" : "—"}</dd><dt>Licencia</dt><dd>${esc(c.licencia || "—")}${c.licVence ? " · vence " + RR.fmtDate(c.licVence, { day: "numeric", month: "short", year: "numeric" }) : ""}</dd>
            <dt>Cliente desde</dt><dd>${RR.fmtDate(c.creado, { day: "numeric", month: "short", year: "numeric" })}</dd></dl></div>
          <div class="dsec"><h4>Validación de requisitos</h4>${verifChecklist(c, isAdmin())}
            <p class="xs subtle" style="margin-top:8px">Cada cambio queda registrado en la auditoría. Los datos declarados por el cliente o la IA quedan <b>pendientes</b> hasta revisión humana.</p></div>
          <div class="dsec"><h4>Consentimientos</h4>
            <div class="verif-row"><span>Tratamiento de datos personales</span>${c.consent?.datos || c.origen !== "manual" ? `<span class="badge b-ok">Otorgado</span>` : `<span class="badge b-warn">Pendiente</span>`}</div>
            <div class="verif-row"><span>Seguimiento comercial</span>${c.consent?.marketing ? `<span class="badge b-ok">Otorgado</span>` : `<span class="badge b-neutral">No otorgado</span>`}</div>
</div>
          <div class="dsec"><h4>Historial · ${rs.length} solicitudes · ${alq.length} alquileres</h4>
            ${rs.length ? rs.map((r) => `<div class="list-item" style="padding:10px 0" data-res="${r.id}"><div class="mini-car" style="width:52px">${RR.carSVG(veh(r.vehiculo).tipo, veh(r.vehiculo).color)}</div><div class="grow"><div class="small bold">${r.codigo} · ${vname(veh(r.vehiculo))}</div><div class="xs subtle">${RR.fmtDate(r.inicio)} → ${RR.fmtDate(r.fin)} · ${RR.money(r.total)}</div></div>${RR.badge(RR.RES_STATUS, r.estado)}</div>`).join("") : '<div class="empty">Sin solicitudes</div>'}</div>
        </div>
        <div class="drawer-foot"><button class="btn btn-primary" id="dcNew">${I.plus}Nueva reserva</button>${isAdmin() ? `<button class="btn" id="dcEdit">${I.edit}Editar datos</button><button class="btn btn-danger" id="dcDel" style="margin-left:auto">Eliminar</button>` : ""}</div>`;
      bindVerif(root, c, draw);
      $("#dcEdit", root)?.addEventListener("click", () => customerForm(c, () => draw()));
      $("#dcDel", root)?.addEventListener("click", () => borrarCliente(c, d.close));
      $$("[data-res]", root).forEach((el) => el.addEventListener("click", () => { d.close(); openReservation(el.dataset.res); }));
      $("#dcNew", root).addEventListener("click", () => { d.close(); newReservation({ cliente: c.id }); });
      $$("[data-close]", root).forEach((b) => b.addEventListener("click", d.close));
    }
    draw();
  }

  /* =================== CONVERSACIONES =================== */
  function viewConversaciones(v) {
    const F = [["todas", "Todas"], ["pendiente", "Pendientes"], ["ia", "IA"], ["humano", "Asesor"]];
    const list = S.conversations.filter((c) => state.convFilter === "todas" || c.estado === state.convFilter).sort((a, b) => (b.estado === "pendiente") - (a.estado === "pendiente") || new Date(b.ultima) - new Date(a.ultima));
    const sel = S.conversations.find((c) => c.id === state.convSel);
    const lastMsg = (c) => { const m = c.mensajes.filter((x) => x.emisor !== "sistema").slice(-1)[0]; return m ? (m.emisor === "cliente" ? "" : m.emisor === "ia" ? "🤖 " : "👤 ") + m.texto : ""; };
    v.innerHTML = `<div class="card inbox ${sel ? "has-sel" : ""}">
      <div class="left">
        <div class="filters"><div class="seg" style="width:100%">${F.map(([k, l]) => `<button style="flex:1" data-f="${k}" class="${state.convFilter === k ? "active" : ""}">${l}</button>`).join("")}</div></div>
        <div class="threads">${list.map((c) => `<div class="thread ${c.id === state.convSel ? "active" : ""}" data-th="${c.id}">${avatar(c.nombre, c.estado === "pendiente" ? "background:var(--danger-bg);color:var(--danger)" : "")}
          <div class="grow"><div class="row between"><b class="small">${esc(c.nombre)}</b><span class="xs subtle">${RR.relTime(c.ultima)}</span></div>
          <div class="row between" style="gap:8px"><span class="prev grow">${esc(lastMsg(c))}</span>${c.noLeidos ? `<span class="unread">${c.noLeidos}</span>` : ""}</div>
          <div style="margin-top:4px">${RR.badge(RR.CONV_STATUS, c.estado)}</div></div></div>`).join("") || '<div class="empty">Sin conversaciones</div>'}</div>
      </div>
      <div class="right">${sel ? convPane(sel) : `<div class="empty" style="margin:auto">${I.chat.replace("<svg", '<svg width="40" height="40" style="margin:0 auto 10px;color:var(--text-3)"')}Selecciona una conversación</div>`}</div>
    </div>
    <p class="xs subtle" style="margin-top:10px">Aquí llegan los chats del sitio web y de WhatsApp. Al tomar una conversación, la IA se pausa y tus respuestas le llegan al cliente por el mismo canal.</p>`;
    $$("[data-f]", v).forEach((b) => b.addEventListener("click", () => { state.convFilter = b.dataset.f; viewConversaciones(v); }));
    $$("[data-th]", v).forEach((t) => t.addEventListener("click", () => { state.convSel = t.dataset.th; const c = S.conversations.find((x) => x.id === t.dataset.th); if (c.noLeidos) { c.noLeidos = 0; RR.api("/api/admin/accion", { tipo: "leer_conv", id: c.id }).catch(() => {}); } renderSide(); viewConversaciones(v); }));
    if (sel) bindConv(v, sel);
  }
  function convPane(c) {
    const r = c.reserva && RR.get.reservation(c.reserva);
    return `<div class="conv-head"><button class="btn btn-ghost btn-icon btn-sm" id="cvBack" aria-label="Volver">${I.back}</button>${avatar(c.nombre)}<div class="grow"><b>${esc(c.nombre)}</b><div class="xs subtle">${c.canal === "whatsapp" ? "WhatsApp" : "Chat web"}${c.tel ? " · " + esc(c.tel) : ""} · ${RR.CONV_STATUS[c.estado].label}</div></div>
        ${r ? `<button class="btn btn-sm" data-res="${r.id}">${r.codigo} · ${RR.RES_STATUS[r.estado].label}</button>` : ""}
        ${c.estado !== "humano" ? `<button class="btn btn-sm btn-primary" id="cvTake">Tomar conversación</button>` : `<button class="btn btn-sm" id="cvBot">Devolver a la IA</button>`}${isAdmin() ? `<button class="btn btn-sm btn-ghost btn-icon" id="cvDel" title="Eliminar conversación" aria-label="Eliminar conversación">${I.x}</button>` : ""}</div>
      ${c.estado === "humano" ? `<div class="conv-banner"><span>Estás atendiendo esta conversación. La IA está en pausa.</span></div>` : c.estado === "pendiente" ? `<div class="conv-banner" style="background:var(--danger-bg);color:var(--danger)"><span>El cliente espera a un asesor desde ${RR.relTime(c.ultima)}. Mientras tanto la IA sigue respondiendo; tómala para pausarla.</span></div>` : ""}
      <div class="wa-body" id="cvBody">${c.mensajes.map((m) => m.emisor === "sistema" ? `<div class="msg sys">${esc(m.texto)}</div>` :
        `<div class="msg ${m.emisor === "cliente" ? "in" : "out"} ${m.emisor === "humano" ? "human" : ""}">${m.emisor === "ia" ? '<span class="msg-label" style="color:#128c7e">Asistente IA</span>' : m.emisor === "humano" ? '<span class="msg-label">Asesor</span>' : ""}${esc(m.texto)}<span class="time">${RR.fmtTime(m.fecha)}</span></div>`).join("")}</div>
      <form class="wa-input" id="cvForm"><input id="cvText" placeholder="${c.estado === "humano" ? "Escribe como asesor…" : "Toma la conversación para responder"}" ${c.estado === "humano" ? "" : "disabled"} autocomplete="off"><button class="wa-send" ${c.estado === "humano" ? "" : "disabled style='opacity:.4'"} aria-label="Enviar">${I.send}</button></form>`;
  }
  function bindConv(v, c) {
    const b = $("#cvBody", v); b.scrollTop = b.scrollHeight;
    const sysMsg = (t) => c.mensajes.push({ emisor: "sistema", texto: t, fecha: new Date().toISOString() });
    $("#cvBack", v).addEventListener("click", () => { state.convSel = null; viewConversaciones(v); });
    $("#cvTake", v) && $("#cvTake", v).addEventListener("click", async () => { if (await act("tomar_conv", { id: c.id })) { renderSide(); viewConversaciones(v); } });
    $("#cvBot", v) && $("#cvBot", v).addEventListener("click", async () => { if (await act("devolver_conv", { id: c.id }, "La IA retoma la conversación")) viewConversaciones(v); });
    $("#cvDel", v)?.addEventListener("click", async () => { if ((await pregunta(`¿Eliminar la conversación con ${c.nombre}?`, "Se borran todos sus mensajes. No se puede deshacer.", "Eliminar", true)) && (await act("borrar_conv", { id: c.id }, "Conversación eliminada"))) { state.convSel = null; refresh(); } });
    $("#cvForm", v).addEventListener("submit", async (e) => { e.preventDefault(); const inp = $("#cvText", v); const t = inp.value.trim(); if (!t) return; inp.disabled = true; if (await act("responder_conv", { id: c.id, texto: t })) { viewConversaciones(v); const n = $("#cvText", v); if (n) n.focus(); } else inp.disabled = false; });
    bindOpeners(v);
  }

  /* =================== AJUSTES =================== */
  function viewAjustes(v) {
    const st = S.settings, ro = !isAdmin(), dis = ro ? "disabled" : "";
    const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${dis}><span></span></label>`;
    const pl = S.plantillas || { servicio: "servicio_conductor", alerta: "alerta_flota", idioma: "es" };
    const activos = (S.conductores || []).filter((c) => c.activo).length;
    const pp = st.picoPlaca || {};
    const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
    const INTEG = [
      S.whatsappActivo
        ? ["WhatsApp Business (Cloud API)", "Conectado", "b-ok", "El asistente responde por WhatsApp y el equipo puede contestar desde Conversaciones"]
        : ["WhatsApp Business (Cloud API)", "Sin configurar", "b-neutral", "Faltan las variables WHATSAPP_* en el servidor (ver guía)"],
      S.iaDisponible
        ? ["Asistente de IA (chat web)", "Conectado", "b-ok", "Responde en el sitio web con datos reales de flota y reservas"]
        : ["Asistente de IA (chat web)", "Sin configurar", "b-warn", "Falta la variable ANTHROPIC_API_KEY en el servidor; mientras tanto los chats pasan a un asesor"],
      S.whatsappActivo && activos
        ? ["Conductores por WhatsApp", "Activo", "b-ok", `Los servicios les llegan a ${activos} conductor(es)`]
        : ["Conductores por WhatsApp", S.whatsappActivo ? "Sin conductores" : "Sin WhatsApp", "b-warn", S.whatsappActivo ? "Agrega conductores en la sección Conductores" : "Se activa cuando WhatsApp esté configurado"],
      ["Base de datos y acceso al panel", "Conectado", "b-ok", "PostgreSQL con bloqueo de reservas duplicadas · sesión segura por usuario"],
      ["Verificación de clientes", "En desarrollo", "b-neutral", "Módulo nuevo a cargo del equipo; mientras tanto los requisitos se marcan a mano"],
      ["Google Calendar", "No conectado", "b-neutral", "Requiere OAuth de Google Cloud"],
    ];
    v.innerHTML = `${ro ? `<div class="callout warn" style="margin-bottom:16px">${I.shield}<span>Estás como <b>Operador</b>: puedes ver la configuración pero solo el administrador puede modificarla.</span></div>` : ""}
    <div class="settings">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Requisitos de alquiler</h3><span class="xs subtle">Se muestran en la web y en el asistente</span></div>
          <div class="set-row"><div><b>Edad mínima</b><div class="xs subtle">Años cumplidos del conductor</div></div><input class="input" type="number" id="sEdad" value="${st.edadMinima}" min="18" max="30" ${dis}></div>
          <div class="set-row"><div><b>Licencia vigente</b><div class="xs subtle">Debe cubrir todo el periodo del alquiler</div></div>${sw("sLic", st.licenciaVigente)}</div>
          <div class="set-row"><div><b>Categorías aceptadas</b></div><div class="row">${["B1", "B2", "C1"].map((k) => `<label class="check" style="align-items:center"><input type="checkbox" data-cat="${k}" ${st.categorias.includes(k) ? "checked" : ""} ${dis}>${k}</label>`).join("")}</div></div>
          <div class="set-row"><div><b>Depósito o garantía</b><div class="xs subtle">Monto definido por vehículo</div></div>${sw("sDep", st.depositoObligatorio)}</div>
          <div class="set-row"><div><b>Experiencia mínima</b><div class="xs subtle">Años con licencia (si aplica)</div></div><div class="row">${sw("sExpOn", st.experienciaActiva)}<input class="input" type="number" id="sExp" value="${st.experienciaMin}" min="0" max="10" style="width:70px" ${dis}></div></div>
          <div class="set-row"><div><b>Documentación adicional</b><div class="xs subtle">Ej.: recibo de servicio público</div></div>${sw("sDoc", st.docAdicional)}</div>
        </div>
        <div class="card"><div class="card-head"><h3>Lugares de entrega y horario</h3><span class="xs subtle">Los usa la web y el asistente</span></div>
          <div class="set-row" style="flex-direction:column;align-items:stretch;gap:6px"><b>Lugares (uno por línea)</b><textarea class="textarea" id="sLug" rows="4" ${dis}>${esc((st.lugares || []).join("\n"))}</textarea></div>
          <div class="set-row" style="flex-direction:column;align-items:stretch;gap:6px"><b>Horario de atención humana</b><input class="input" id="sHor" value="${esc(st.horario || "")}" maxlength="120" style="width:100%" ${dis}></div>
        </div>
        <div class="card"><div class="card-head"><h3>Pre-reservas y recordatorios</h3></div>
          <div class="set-row"><div><b>Vencimiento de pre-reserva</b><div class="xs subtle">Tiempo que una solicitud bloquea el vehículo</div></div><select class="select" id="sPre" ${dis}>${[6, 12, 24, 48].map((h) => `<option value="${h}" ${st.prereservaHoras === h ? "selected" : ""}>${h} horas</option>`).join("")}</select></div>
          <div class="set-row"><div><b>Recordatorio de entrega</b><div class="xs subtle">Horas antes de la recogida</div></div><select class="select" id="sRec" ${dis}>${[2, 12, 24, 48].map((h) => `<option value="${h}" ${st.recordatorioHoras === h ? "selected" : ""}>${h} horas</option>`).join("")}</select></div>
          <div class="set-row"><div><b>Retención de documentos</b><div class="xs subtle">Días después de finalizar el servicio</div></div><select class="select" id="sRet" ${dis}>${[30, 60, 90, 180].map((h) => `<option value="${h}" ${st.retencionDias === h ? "selected" : ""}>${h} días</option>`).join("")}</select></div>
        </div>
        <div class="card"><div class="card-head"><h3>Pico y placa (Cali)</h3><span class="xs subtle">Último dígito de la placa, separado por comas</span></div>
          ${DIAS.map((d, i) => `<div class="set-row"><b>${d}</b><input class="input" data-pp="${i + 1}" value="${esc((pp[String(i + 1)] || []).join(", "))}" style="width:120px" placeholder="1, 2" ${dis}></div>`).join("")}
          <div class="set-row"><span class="xs subtle">Avisa el día anterior para los carros de Uber. Cambia cada semestre: revisa la Secretaría de Movilidad de Cali.</span></div>
        </div>
        ${ro ? "" : `<div class="row" style="justify-content:flex-end"><button class="btn btn-primary" id="sSave">Guardar configuración</button></div>`}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>WhatsApp · conductores y alertas</h3><span class="badge ${S.whatsappActivo ? "b-ok" : "b-neutral"}">${S.whatsappActivo ? "WhatsApp conectado" : "WhatsApp sin configurar"}</span></div>
          <div class="set-row" style="flex-direction:column;align-items:stretch;gap:6px"><b>Celulares que reciben las alertas de la flota</b><textarea class="textarea" id="sAlW" rows="2" placeholder="+57 316 586 2704" ${dis}>${esc((st.alertasWhatsapp || []).join("\n"))}</textarea><span class="xs subtle">Uno por línea (máximo 5). Reciben un resumen cuando aparece una alerta nueva. Se guarda con «Guardar configuración».</span></div>
          <div class="set-row" style="flex-direction:column;align-items:stretch;gap:8px">
            <b>Plantillas que hay que crear y aprobar en Meta</b>
            <span class="xs subtle">WhatsApp solo deja escribirle primero a alguien con una plantilla aprobada. Créalas en Meta → WhatsApp Manager → Plantillas de mensajes, categoría <b>Utilidad</b>, idioma <b>Español (${esc(pl.idioma)})</b>. Mientras no estén aprobadas, solo les llegan a quienes le hayan escrito al número del negocio en las últimas 24 horas.</span>
            <div class="small"><b class="mono">${esc(pl.servicio)}</b> · botón de respuesta rápida «Tomar servicio»</div>
            <pre class="tpl" data-copy>🚗 Nuevo servicio {{1}}
Recoger en: {{2}}
Destino: {{3}}
Cuándo: {{4}}
Pasajeros: {{5}}
Notas: {{6}}
El primero que pulse Tomar servicio se lo queda.</pre>
            <div class="small"><b class="mono">${esc(pl.alerta)}</b> · sin botones</div>
            <pre class="tpl" data-copy>🔔 Alerta de la flota: {{1}}
Revisa el panel para ver los detalles.</pre>
            <span class="xs subtle">Toca un recuadro para copiar el texto.</span>
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>Integraciones</h3><span class="xs subtle">Estado actual del servidor</span></div>
          ${INTEG.map(([n, s, cls, d]) => `<div class="set-row"><div><b>${n}</b><div class="xs subtle">${d}</div></div><span class="badge ${cls}">${s}</span></div>`).join("")}
          ${ro ? "" : `<div class="set-row" style="flex-direction:column;align-items:stretch"><button class="btn btn-sm" id="waTest">Probar conexión con WhatsApp</button><div id="waTestOut"></div></div>`}</div>
        <div class="card"><div class="card-head"><h3>Usuarios del panel</h3>${ro ? "" : `<button class="btn btn-sm" id="uNew">${I.plus}Agregar</button>`}</div>
          ${ro ? `<div class="set-row"><div class="row" style="gap:10px">${avatar(me.nombre)}<div><b>${esc(me.nombre)}</b><div class="xs subtle">Sesión actual</div></div></div><span class="badge b-ok">${me.rol}</span></div>`
            : (S.usuarios || []).map((x) => `<div class="set-row"><div class="row" style="gap:10px">${avatar(x.nombre, x.activo ? "" : "opacity:.45")}<div><b>${esc(x.nombre)}</b>${x.id === me.id ? ' <span class="xs subtle">(tú)</span>' : ""}<div class="xs subtle">${esc(x.email)}</div></div></div><div class="row"><span class="badge ${x.activo ? (x.rol === "admin" ? "b-brand" : "b-ok") : "b-neutral"}">${x.activo ? (x.rol === "admin" ? "Administrador" : "Operador") : "Inactivo"}</span><button class="btn btn-sm btn-ghost btn-icon" data-u-edit="${x.id}" aria-label="Editar usuario">${I.edit}</button>${x.id === me.id ? "" : `<button class="btn btn-sm btn-ghost btn-icon" data-u-del="${x.id}" aria-label="Eliminar usuario">${I.x}</button>`}</div></div>`).join("")}
          <div class="set-row"><div class="small muted"><b>Administrador:</b> aprueba, verifica requisitos, edita flota, usuarios y ajustes.<br><b>Operador:</b> gestiona reservas, servicios y conversaciones; ve documentos enmascarados.</div></div>
        </div>
        <div class="card"><div class="card-head"><h3>Registro de actividad</h3><span class="xs subtle">Auditoría de acciones</span></div>
          ${S.audit.slice(0, 12).map((a) => `<div class="set-row" style="align-items:flex-start"><div class="small">${esc(a.accion)}<div class="xs subtle">${esc(a.actor)}</div></div><span class="xs subtle" style="white-space:nowrap">${RR.relTime(a.fecha)}</span></div>`).join("")}
        </div>
      </div>
    </div>`;
    if (ro) return;
    $("#waTest", v).addEventListener("click", async () => {
      const btn = $("#waTest", v), out = $("#waTestOut", v);
      btn.disabled = true; btn.textContent = "Probando…";
      try {
        const { prueba: p } = await RR.api("/api/admin/accion", { tipo: "probar_whatsapp" });
        const tok = p.tokenInfo ? `Token en el servidor: termina en <b>${esc(p.tokenInfo.fin)}</b> (${p.tokenInfo.largo} caracteres). Phone Number ID: ${esc(p.phoneId || "—")}.` : "";
        out.innerHTML = p.ok
          ? `<div class="callout ok" style="margin-top:10px">${I.check}<span>Conexión correcta con el número <b>${esc(p.numero || "")}</b>${p.nombre ? ` (${esc(p.nombre)})` : ""}. ${tok}</span></div>`
          : `<div class="callout err" style="margin-top:10px">${I.alert}<span>${esc(p.error)}<br>${tok}</span></div>`;
      } catch (e) { out.innerHTML = `<div class="callout err" style="margin-top:10px">${I.alert}<span>${esc(e.message)}</span></div>`; }
      btn.disabled = false; btn.textContent = "Probar conexión con WhatsApp";
    });
    $$("[data-copy]", v).forEach((pre) => pre.addEventListener("click", () => {
      navigator.clipboard?.writeText(pre.textContent).then(() => RR.toast("Texto de la plantilla copiado"), () => RR.toast("Selecciónalo y cópialo con Ctrl+C", true));
    }));
    $("#uNew", v)?.addEventListener("click", () => userForm(null));
    $$("[data-u-edit]", v).forEach((b) => b.addEventListener("click", () => userForm(S.usuarios.find((x) => x.id === b.dataset.uEdit))));
    $$("[data-u-del]", v).forEach((b) => b.addEventListener("click", async () => {
      const x = S.usuarios.find((y) => y.id === b.dataset.uDel);
      if (await pregunta(`¿Eliminar a ${x.nombre}?`, "Ya no podrá entrar al panel. Su actividad pasada se conserva en la auditoría. Si solo quieres bloquearlo, márcalo como inactivo.", "Eliminar", true)) { if (await act("borrar_usuario", { id: x.id }, "Usuario eliminado")) viewAjustes(v); }
    }));
    $("#sSave", v).addEventListener("click", () => {
      const cats = $$("[data-cat]", v).filter((c) => c.checked).map((c) => c.dataset.cat);
      if (!cats.length) return RR.toast("Selecciona al menos una categoría de licencia", true);
      const lugares = $("#sLug", v).value.split("\n").map((x) => x.trim()).filter(Boolean);
      if (!lugares.length) return RR.toast("Escribe al menos un lugar de entrega", true);
      const alertasWhatsapp = $("#sAlW", v).value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
      if (alertasWhatsapp.length > 5 || alertasWhatsapp.some((x) => !/^\+?[0-9 ]{10,16}$/.test(x))) return RR.toast("Celulares de alertas: máximo 5, con 10 dígitos cada uno", true);
      const picoPlaca = {};
      for (const inp of $$("[data-pp]", v)) {
        const ds = inp.value.split(/[,\s;y]+/).map((x) => x.trim()).filter(Boolean);
        if (ds.some((x) => !/^\d$/.test(x))) return RR.toast("Pico y placa: escribe solo dígitos del 0 al 9 separados por comas", true);
        picoPlaca[inp.dataset.pp] = ds.map(Number);
      }
      const data = { edadMinima: +$("#sEdad", v).value, licenciaVigente: $("#sLic", v).checked, categorias: cats, depositoObligatorio: $("#sDep", v).checked, experienciaActiva: $("#sExpOn", v).checked, experienciaMin: +$("#sExp", v).value, docAdicional: $("#sDoc", v).checked, prereservaHoras: +$("#sPre", v).value, recordatorioHoras: +$("#sRec", v).value, retencionDias: +$("#sRet", v).value, lugares, horario: $("#sHor", v).value.trim(), picoPlaca, alertasWhatsapp };
      act("ajustes", { data }, "Configuración guardada").then((x) => { if (x) { RR.setBusiness(S.negocio, S.settings); viewAjustes(v); } });
    });
  }

  /* ---------- Arranque ---------- */
  function start() {
    window.addEventListener("hashchange", route);
    // Sincroniza si en otra pestaña (sitio público) se crea una solicitud
    // Actualiza cada 20 s (nuevas solicitudes y mensajes) si no hay un formulario abierto.
    setInterval(async () => {
      if (document.hidden || document.querySelector(".overlay") || (document.activeElement && document.activeElement.matches("input, textarea, select"))) return;
      const contar = () => S.reservations.length + S.conversations.reduce((n, c) => n + c.mensajes.length, 0);
      const antes = contar();
      try { if (!(await cargar())) return location.reload(); } catch (e) { return; }
      if (contar() !== antes) { refresh(); RR.toast("Nueva actividad recibida"); } else { renderSide(); renderTop(); }
    }, 20000);
    route();
  }
  cargar().then((ok) => (ok ? start() : login())).catch(() => { document.body.innerHTML = '<div class="empty" style="padding:80px 20px">No se pudo conectar con el servidor. Recarga la página.</div>'; });
})();
