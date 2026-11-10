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

  const state = { view: "resumen", resTab: "todas", resQ: "", calMode: "semana", calDate: RR.startOfDay(new Date()), vehTab: "todos", cliQ: "", convFilter: "todas", convSel: null, antTab: "todos", antQ: "" };

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
      <div class="row" style="gap:10px;margin-bottom:22px"><span style="width:36px;height:36px;border-radius:10px;background:var(--brand);color:#fff;display:grid;place-items:center">${I.car.replace("<svg", '<svg width="20" height="20"')}</span><div><b style="font-size:17px">RodaRent</b><div class="xs muted">Panel del equipo</div></div></div>
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
    ["clientes", "Clientes", "users"],
    ["conversaciones", "Conversaciones", "chat", () => unattended()],
    ["antecedentes", "Antecedentes", "shield", null, true],
    ["ajustes", "Ajustes", "settings"],
  ];
  function renderSide() {
    $("#side").innerHTML = `
      <div class="brand"><span class="mk">${I.car}</span><div>RodaRent<small>${esc(RR.BUSINESS.name)}</small></div></div>
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
    vehiculos: ["Vehículos", () => `${S.vehicles.length} vehículos en la flota`],
    clientes: ["Clientes", () => `${S.customers.length} clientes registrados`],
    conversaciones: ["Conversaciones", () => "Chats del sitio web atendidos por la IA y el equipo"],
    antecedentes: ["Antecedentes", () => "Cédulas de clientes y personal en la Procuraduría"],
    ajustes: ["Ajustes", () => "Requisitos, pre-reservas, integraciones y seguridad"],
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
    pop.innerHTML = `<div class="card-head"><h3>Notificaciones</h3><span class="xs subtle">En el panel · WhatsApp/correo aún no conectados</span></div>
      ${items.length ? items.map((n) => `<div class="item"><span class="ic">${I[n.ic]}</span><div><div>${esc(n.texto)}</div>${n.fecha ? `<div class="xs subtle">${RR.relTime(n.fecha)}</div>` : ""}</div></div>`).join("") : '<div class="empty">Sin novedades</div>'}`;
    document.body.appendChild(pop);
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
    return out;
  }

  /* ---------- Router ---------- */
  function route() {
    const h = location.hash.replace("#", "") || "resumen";
    state.view = TITLES[h] && (h !== "antecedentes" || isAdmin()) ? h : "resumen";
    renderSide(); render();
    window.scrollTo(0, 0);
  }
  function render() {
    renderTop();
    const v = $("#view");
    ({ resumen: viewResumen, reservas: viewReservas, calendario: viewCalendario, vehiculos: viewVehiculos, clientes: viewClientes, conversaciones: viewConversaciones, antecedentes: viewAntecedentes, ajustes: viewAjustes })[state.view](v);
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
        ${kpi("Clientes nuevos", "users", nuevos.length, "Últimos 7 días", "clientes")}
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
            ${al.length ? al.map((a) => `<div class="alert-row" ${a.res ? `data-res="${a.res}"` : ""} ${a.conv ? `data-conv="${a.conv}"` : ""} style="cursor:pointer;color:${a.type === "err" ? "var(--danger)" : a.type === "warn" ? "var(--warn)" : "var(--info)"}">${I.alert}<span style="color:var(--text)">${esc(a.text)}</span></div>`).join("") : '<div class="empty">Sin alertas</div>'}
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
            ${S.vehicles.map((x) => `<div class="list-item" style="cursor:default;padding:8px 20px"><div class="mini-car" style="width:48px">${RR.carSVG(x.tipo, x.color)}</div><div class="grow small bold">${vname(x)}</div>${RR.badge(RR.VEH_STATUS, RR.vehicleStatus(x))}</div>`).join("")}
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
            <div class="row" style="gap:14px;margin-bottom:12px"><div style="width:110px">${RR.carSVG(vv.tipo, vv.color)}</div><div><b>${vname(vv)}</b> · ${vv.anio || ""}<div class="row" style="margin-top:6px"><span class="plate">${vv.placa || ""}</span></div></div></div>
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
      } else foot.innerHTML = `<span class="small muted">Reserva cerrada. No admite cambios.</span>`;

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
      bindVerif(root, c, draw);
      const bp = $("#dcProcu", root);
      if (bp) bp.addEventListener("click", () => { d.close(); consultarAntecedentes("cliente", c.id); });
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
      E("#nV").innerHTML = S.vehicles.map((x) => { const ok = b > a && RR.isAvailable(x, a.toISOString(), b.toISOString()); return `<option value="${x.id}" ${ok ? "" : "disabled"} ${cur === x.id ? "selected" : ""}>${vname(x)} · ${x.placa} · ${RR.money(x.precio)}/día${ok ? "" : x.estado === "mantenimiento" ? " — mantenimiento" : " — ocupado"}</option>`; }).join("");
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
        ${S.vehicles.map((x) => {
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
        <div class="card"><div class="card-head"><h3>Vehículos comprometidos</h3><span class="badge b-neutral">${using.length}/${S.vehicles.length}</span></div>
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
    const tabs = [["todos", "Todos"], ["disponible", "Disponibles"], ["reservado", "Reservados"], ["alquilado", "Alquilados"], ["mantenimiento", "Mantenimiento"], ["inactivo", "Inactivos"]];
    const list = S.vehicles.filter((x) => state.vehTab === "todos" || RR.vehicleStatus(x) === state.vehTab);
    v.innerHTML = `
      <div class="row between wrap" style="margin-bottom:16px;gap:12px">
        <div class="seg" style="overflow-x:auto;max-width:100%">${tabs.map(([k, l]) => `<button data-vt="${k}" class="${state.vehTab === k ? "active" : ""}">${l} <span class="subtle">${k === "todos" ? S.vehicles.length : S.vehicles.filter((x) => RR.vehicleStatus(x) === k).length}</span></button>`).join("")}</div>
        <button class="btn" id="addVeh" ${isAdmin() ? "" : "disabled title='Solo administrador'"}>${I.plus}Agregar vehículo</button>
      </div>
      <div class="fleet">${list.map((x) => {
        const st = RR.vehicleStatus(x);
        const next = S.reservations.filter((r) => r.vehiculo === x.id && RR.isBlocking(r) && new Date(r.fin) > new Date()).sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0];
        return `<div class="card"><div class="car-art">${RR.badge(RR.VEH_STATUS, st)}${RR.carSVG(x.tipo, x.color)}</div>
          <div class="body">
            <div class="row between"><div><b>${vname(x)}</b><div class="xs subtle">${RR.TYPE_LABEL[x.tipo]} · ${x.anio} · ${x.capacidad} puestos</div></div><span class="plate">${x.placa}</span></div>
            <div class="row between"><span class="price" style="font-size:17px">${RR.money(x.precio)} <small>/ día</small></span><span class="xs subtle">Depósito ${RR.money(x.deposito)}</span></div>
            <div class="xs muted" style="min-height:18px">${next ? `${st === "alquilado" ? "Regresa" : "Próxima"}: ${st === "alquilado" ? RR.fmtDT(next.fin) : RR.fmtDT(next.inicio)} · ${next.codigo}` : "Sin reservas próximas"}</div>
            <div class="row"><button class="btn btn-sm grow" data-edit="${x.id}">${I.edit}${isAdmin() ? "Editar" : "Ver"}</button><button class="btn btn-sm grow" data-cal="${x.id}">${I.cal}Calendario</button></div>
          </div></div>`;
      }).join("") || '<div class="empty">Sin vehículos en este estado.</div>'}</div>`;
    $$("[data-vt]", v).forEach((b) => b.addEventListener("click", () => { state.vehTab = b.dataset.vt; viewVehiculos(v); }));
    $$("[data-edit]", v).forEach((b) => b.addEventListener("click", () => vehicleForm(RR.get.vehicle(b.dataset.edit))));
    $$("[data-cal]", v).forEach((b) => b.addEventListener("click", () => { state.calMode = "semana"; location.hash = "calendario"; }));
    $("#addVeh", v).addEventListener("click", () => vehicleForm(null));
  }

  function vehicleForm(x) {
    const isNew = !x, ro = !isAdmin();
    const d = x || { marca: "", modelo: "", anio: new Date().getFullYear(), placa: "", tipo: "sedan", capacidad: 5, maletas: 2, transmision: "Automática", combustible: "Gasolina", color: "#3b4a63", precio: 150000, deposito: 700000, estado: "disponible" };
    const f = (id, label, val, type = "text", extra = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" value="${esc(val)}" ${ro ? "disabled" : ""} ${extra}></div>`;
    const sel = (id, label, opts, val) => `<div class="field"><label for="${id}">${label}</label><select class="select" id="${id}" ${ro ? "disabled" : ""}>${opts.map(([k, l]) => `<option value="${k}" ${k === val ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
    const m = RR.openModal(`<div class="modal-head"><div><h2>${isNew ? "Agregar vehículo" : vname(d)}</h2>${ro ? '<p class="small muted" style="margin-top:4px">Solo lectura · el operador no puede modificar tarifas ni la flota.</p>' : ""}</div><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack">
        <div class="car-art" id="vfArt" style="border-radius:12px;aspect-ratio:auto;height:150px">${RR.carSVG(d.tipo, d.color)}</div>
        <div class="form-grid">
          ${f("vfMarca", "Marca", d.marca)}${f("vfModelo", "Modelo", d.modelo)}
          ${f("vfPlaca", "Placa", d.placa, "text", 'placeholder="ABC-123" style="text-transform:uppercase"')}${f("vfAnio", "Año", d.anio, "number", 'min="2000" max="2030"')}
          ${sel("vfTipo", "Tipo", Object.entries(RR.TYPE_LABEL), d.tipo)}${f("vfColor", "Color (ilustración)", d.color, "color", 'style="padding:4px;height:42px"')}
          ${f("vfCap", "Capacidad (puestos)", d.capacidad, "number", 'min="1" max="20"')}${f("vfMal", "Maletas", d.maletas, "number", 'min="0" max="12"')}
          ${sel("vfTrans", "Transmisión", [["Automática", "Automática"], ["Mecánica", "Mecánica"]], d.transmision)}${sel("vfComb", "Combustible", [["Gasolina", "Gasolina"], ["Diésel", "Diésel"], ["Híbrido", "Híbrido"], ["Eléctrico", "Eléctrico"]], d.combustible)}
          ${f("vfPrecio", "Precio por día (COP)", d.precio, "number", 'min="0" step="5000"')}${f("vfDep", "Depósito (COP)", d.deposito, "number", 'min="0" step="50000"')}
          ${sel("vfEstado", "Estado", [["disponible", "Disponible"], ["mantenimiento", "Mantenimiento"], ["inactivo", "Inactivo"]], d.estado)}
          <p class="help full">"Reservado" y "Alquilado" se calculan automáticamente según las reservas. La carga de fotos reales llega en la siguiente etapa; por ahora se usa la ilustración con el color elegido.</p>
        </div>
        <div id="vfErr"></div>
      </div>
      <div class="modal-foot">${!isNew && !ro ? `<button class="btn btn-danger" id="vfDel" style="margin-right:auto">Desactivar</button>` : ""}<button class="btn" data-close>${ro ? "Cerrar" : "Cancelar"}</button>${ro ? "" : `<button class="btn btn-primary" id="vfSave">${isNew ? "Agregar" : "Guardar"}</button>`}</div>`);
    const E = (s) => $(s, m.el);
    const art = () => (E("#vfArt").innerHTML = RR.carSVG(E("#vfTipo").value, E("#vfColor").value));
    E("#vfTipo").addEventListener("change", art); E("#vfColor").addEventListener("input", art);
    if (ro) return;
    E("#vfDel") && E("#vfDel").addEventListener("click", async () => {
      const data = { marca: x.marca, modelo: x.modelo, placa: x.placa, anio: x.anio, tipo: x.tipo, color: x.color, capacidad: x.capacidad, maletas: x.maletas, transmision: x.transmision, combustible: x.combustible, precio: x.precio, deposito: x.deposito, estado: "inactivo" };
      if (await act("guardar_vehiculo", { id: x.id, data }, "Vehículo desactivado (no se borra el historial)")) { m.close(); refresh(); }
    });
    E("#vfSave").addEventListener("click", async () => {
      const placa = E("#vfPlaca").value.trim().toUpperCase();
      const data = { marca: E("#vfMarca").value.trim(), modelo: E("#vfModelo").value.trim(), placa, anio: +E("#vfAnio").value, tipo: E("#vfTipo").value, color: E("#vfColor").value, capacidad: +E("#vfCap").value, maletas: +E("#vfMal").value, transmision: E("#vfTrans").value, combustible: E("#vfComb").value, precio: +E("#vfPrecio").value, deposito: +E("#vfDep").value, estado: E("#vfEstado").value };
      const errs = [];
      if (!data.marca || !data.modelo) errs.push("Marca y modelo son obligatorios.");
      if (!/^[A-Z]{3}-?\d{2}[0-9A-Z]$/.test(placa)) errs.push("Placa inválida (formato ABC-123).");
      if (S.vehicles.some((o) => o.placa.replace("-", "") === placa.replace("-", "") && o !== x)) errs.push("Ya existe un vehículo con esa placa.");
      if (!(data.precio > 0)) errs.push("El precio por día debe ser mayor a 0.");
      if (data.anio < 2000 || data.anio > 2030) errs.push("Año fuera de rango.");
      if (errs.length) { E("#vfErr").innerHTML = `<div class="callout err">${I.alert}<div>${errs.join("<br>")}</div></div>`; return; }
      if (await act("guardar_vehiculo", { id: isNew ? undefined : x.id, data }, isNew ? "Vehículo agregado" : "Cambios guardados")) { m.close(); refresh(); }
    });
  }

  /* =================== CLIENTES =================== */
  function viewClientes(v) {
    const q = state.cliQ.toLowerCase();
    const list = S.customers.filter((c) => !q || [c.nombre, c.doc, c.tel, c.email].join(" ").toLowerCase().includes(q)).sort((a, b) => new Date(b.creado) - new Date(a.creado));
    v.innerHTML = `<div class="card">
      <div class="toolbar"><div class="search-in">${I.search}<input class="input" id="cliQ" placeholder="Buscar por nombre, documento o teléfono" value="${esc(state.cliQ)}"></div><span class="grow"></span>
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
    bindOpeners(v);
  }

  /* =================== ANTECEDENTES (Procuraduría) =================== */
  // La consulta la hace una persona del equipo en la página oficial (ella responde la pregunta del sitio).
  // El panel copia la cédula, abre la página y lee el resultado que se pega o el certificado que se sube.
  const URL_PROCU = "https://apps.procuraduria.gov.co/webcert/inicio.aspx";
  const ANT = {
    limpio: ["Sin antecedentes", "b-ok", "LIMPIO", "C6EFCE"],
    con_antecedentes: ["Con antecedentes", "b-danger", "CON ANTECEDENTES", "FFC7CE"],
    no_encontrado: ["No encontrado", "b-warn", "NO ENCONTRADO", "FFEB9C"],
    revisar: ["Por revisar", "b-warn", "REVISAR MANUALMENTE", "DDEBF7"],
  };
  // RR.confirm usa callback; si se cancela, la promesa simplemente no se resuelve.
  const pregunta = (t, x, ok, danger) => new Promise((res) => RR.confirm(t, x, ok, () => res(true), danger));
  const docNum = (d) => String(d || "").replace(/\D/g, "");
  const antBadge = (c) => (c ? `<span class="badge ${ANT[c.estado][1]}">${ANT[c.estado][0]}</span>` : `<span class="badge plain b-neutral">Sin consultar</span>`);
  const ultimaConsulta = (tipo, id) => (S.consultas || []).find((x) => x[tipo] === id);
  function sujetos() {
    return [
      ...S.customers.map((c) => ({ tipo: "cliente", id: c.id, nombre: c.nombre, doc: docNum(c.doc), rol: "Cliente", tel: c.tel || "", consent: !!c.consent?.antecedentes })),
      ...(S.personal || []).map((p) => ({ tipo: "personal", id: p.id, nombre: p.nombre, doc: p.doc, rol: p.cargo || "Personal", tel: p.tel || "", consent: false })),
    ].map((s) => ({ ...s, ult: ultimaConsulta(s.tipo, s.id) }));
  }
  const sujetoDe = (tipo, id) => sujetos().find((s) => s.tipo === tipo && s.id === id);
  const ANT_TABS = [
    ["todos", "Todos", () => true],
    ["sin", "Sin consultar", (s) => !s.ult],
    ["novedad", "Con novedad", (s) => s.ult && s.ult.estado !== "limpio"],
    ["personal", "Personal", (s) => s.tipo === "personal"],
    ["clientes", "Clientes", (s) => s.tipo === "cliente"],
  ];

  /* ---------- Puente con la página de la Procuraduría (botón de favoritos) ----------
     El botón "⭐ RodaRent" se guarda una vez en la barra de favoritos. En la Procuraduría:
     1.er clic → llena la cédula; la persona responde la pregunta y pulsa Consultar;
     2.º clic → envía el resultado al panel (que lo guarda y pasa a la siguiente persona).
     La pregunta de verificación del sitio siempre la responde la persona. */
  const PROCU_ORIGIN = "https://apps.procuraduria.gov.co";
  const procu = { actual: null, cola: null };
  function codigoMarcador() {
    const js = `(function(){var O=${JSON.stringify(location.origin)},U=${JSON.stringify(URL_PROCU)},op=window.opener;
function aviso(t,ok){var d=document.getElementById('rrAviso');if(!d){d=document.createElement('div');d.id='rrAviso';d.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;padding:12px 18px;border-radius:10px;font:600 15px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center';document.body.appendChild(d);}d.style.background=ok?'#e7f6ec':'#fff4e0';d.style.color=ok?'#11643a':'#7a4a00';d.textContent=t;}
if(!/procuraduria\\.gov\\.co$/.test(location.hostname)){alert('Usa este botón en la página de antecedentes de la Procuraduría.');return;}
if(!op||op.closed){alert('Abre la Procuraduría desde el panel de RodaRent (botón Consultar) y usa este botón en esa pestaña.');return;}
function esp(tipo,cb){var t,h=function(e){if(e.origin===O&&e.data&&e.data.rr===tipo){window.removeEventListener('message',h);clearTimeout(t);cb(e.data);}};t=setTimeout(function(){window.removeEventListener('message',h);aviso('El panel de RodaRent no respondió. ¿Sigue abierto?',false);},8000);window.addEventListener('message',h);}
var hay=/identificad[oa]/i.test(document.body.innerText)&&!document.getElementById('rrEnviado');
if(!hay){esp('cedula',function(d){if(!d.cedula){aviso(d.mensaje||'En el panel no hay ninguna consulta abierta.',false);return;}var c=document.getElementById('txtNumID'),s=document.getElementById('ddlTipoID'),r=document.getElementById('txtRespuestaPregunta');if(!c){aviso('No encontré el formulario de consulta.',false);return;}if(s)s.value='1';c.value=d.cedula;aviso('Cédula '+d.cedula+(d.nombre?' · '+d.nombre:'')+' lista. Responde la pregunta y pulsa Consultar.',true);if(r){r.value='';r.focus();r.style.outline='3px solid #2546d8';}});op.postMessage({rr:'pedir'},O);return;}
document.querySelectorAll('span').forEach(function(s){s.append(' ');});
var k=document.createElement('i');k.id='rrEnviado';k.hidden=true;document.body.appendChild(k);
aviso('Enviando a RodaRent…',true);
esp('respuesta',function(d){aviso(d.mensaje||'Enviado al panel.',!!d.guardado);if(d.siguiente){setTimeout(function(){location.href=U;},1600);}});
op.postMessage({rr:'resultado',texto:document.body.innerText},O);})()`;
    return "javascript:" + encodeURIComponent(js.replace(/\n/g, ""));
  }
  const marcadorHTML = () => `<a class="btn ant-fav" href="${codigoMarcador()}" draggable="true" title="Arrástrame a la barra de favoritos" data-fav>⭐ RodaRent</a>`;
  const bindMarcador = (root) => $$("[data-fav]", root).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); RR.toast("Arrastra este botón a tu barra de favoritos (Ctrl+Shift+B la muestra)"); }));
  const abrirProcu = () => window.open(URL_PROCU, "rr_procuraduria");

  window.addEventListener("message", async (e) => {
    if (e.origin !== PROCU_ORIGIN || !e.data || typeof e.data !== "object" || !e.source) return;
    const responder = (d) => e.source.postMessage(d, e.origin);
    const a = procu.actual;
    if (e.data.rr === "pedir") {
      responder(a ? { rr: "cedula", cedula: a.doc, nombre: a.nombre } : { rr: "cedula", cedula: null, mensaje: "En el panel de RodaRent no hay ninguna consulta abierta. Pulsa «Consultar» junto a una persona." });
    } else if (e.data.rr === "resultado" && typeof e.data.texto === "string") {
      if (!a) { responder({ rr: "respuesta", guardado: false, mensaje: "En el panel no hay ninguna consulta abierta." }); return; }
      try { responder({ rr: "respuesta", ...(await a.recibir(e.data.texto.slice(0, 60000))) }); }
      catch (err) { responder({ rr: "respuesta", guardado: false, mensaje: err.message || "No se pudo procesar el resultado." }); }
    }
  });

  /* ---------- Modo seguido: consultar varias personas una tras otra ---------- */
  function consultarSeguido(lista) {
    if (!lista.length) { RR.toast("No hay personas sin consultar"); return; }
    const sinAut = lista.filter((s) => !s.consent).length;
    const m = RR.openModal(`<div class="modal-head"><h2>Consultar ${lista.length} persona(s) seguidas</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Cerrar">${I.x}</button></div>
      <div class="modal-body stack">
        <p class="muted small">Se abre la Procuraduría en otra pestaña y te quedas allí. Por cada persona:</p>
        <div class="ant-steps" style="grid-template-columns:1fr">
          <div><b>1</b><span>Pulsa <b>⭐ RodaRent</b> en tus favoritos: se llena la cédula.</span></div>
          <div><b>2</b><span>Responde la pregunta y pulsa <b>Consultar</b>.</span></div>
          <div><b>3</b><span>Pulsa otra vez <b>⭐ RodaRent</b>: el resultado se guarda solo en el panel y la página queda lista para la siguiente persona.</span></div>
        </div>
        <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">${marcadorHTML()}<span class="xs subtle">¿No lo tienes? Arrástralo a la barra de favoritos (Ctrl+Shift+B la muestra).</span></div>
        ${sinAut ? `<label class="check"><input type="checkbox" id="sqAut"><span>Confirmo que estas ${lista.length} personas autorizaron consultar sus antecedentes (Ley 1581 de 2012). Quedará registrado a mi nombre.</span></label>` : ""}
      </div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="sqGo" ${sinAut ? "disabled" : ""}>${I.link}Empezar y abrir Procuraduría</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "540px";
    bindMarcador(m.el);
    if (sinAut) $("#sqAut", m.el).addEventListener("change", (e) => ($("#sqGo", m.el).disabled = !e.target.checked));
    $("#sqGo", m.el).addEventListener("click", () => {
      m.close();
      procu.cola = { lista: lista.map((s) => ({ tipo: s.tipo, id: s.id })), i: 0, hechas: 0, ultimo: "" };
      abrirProcu();
      siguienteEnCola();
    });
  }
  function siguienteEnCola() {
    const c = procu.cola; if (!c) return;
    const item = c.lista[c.i];
    const s = item && sujetoDe(item.tipo, item.id);
    if (!s) { finCola(); return null; }
    procu.actual = {
      doc: s.doc, nombre: s.nombre,
      recibir: async (texto) => {
        const r = await RR.api("/api/admin/accion", { tipo: "leer_antecedentes", sujeto: s.tipo, id: s.id, texto });
        const l = r.lectura;
        if (!l.documento) return { guardado: false, mensaje: "No encontré el resultado en esta página. Pulsa Consultar primero y luego ⭐ RodaRent." };
        if (!l.coincide_documento) return { guardado: false, mensaje: `Este resultado es de la cédula ${l.documento}, pero toca ${s.doc} (${s.nombre}). Pulsa ⭐ RodaRent en el formulario para llenarla.` };
        const g = await act("guardar_antecedentes", { sujeto: s.tipo, id: s.id, texto, autorizado: true });
        if (!g) return { guardado: false, mensaje: "No se pudo guardar. Revisa el panel." };
        c.hechas++; c.i++;
        const ok = l.estado === "limpio" && l.coincide_nombre !== false;
        c.ultimo = `${ok ? "✓" : "⚠"} ${s.nombre}: ${ANT[l.estado][0]}${l.coincide_nombre === false ? " · nombre distinto" : ""}`;
        const sig = siguienteEnCola();
        if (state.view === "antecedentes") refresh();
        return { guardado: true, siguiente: sig ? sig.doc : null, mensaje: `${c.ultimo}${ok ? "" : " (quedó para tu revisión)"}. ${sig ? `Siguiente: ${sig.nombre}.` : "¡Listo, era la última!"}` };
      },
    };
    pintarCola();
    return s;
  }
  function finCola() {
    const c = procu.cola;
    procu.actual = null; procu.cola = null;
    $("#rrCola")?.remove();
    if (c) RR.toast(`Modo seguido terminado: ${c.hechas} consulta(s) guardada(s)`);
    if (state.view === "antecedentes") refresh();
  }
  function pintarCola() {
    const c = procu.cola; if (!c) return;
    let box = $("#rrCola");
    if (!box) { box = document.createElement("div"); box.id = "rrCola"; box.className = "ant-cola"; document.body.appendChild(box); }
    const a = procu.actual;
    box.innerHTML = `<div class="row between" style="gap:8px"><b class="small">Consultando seguidas · ${Math.min(c.i + 1, c.lista.length)} de ${c.lista.length}</b><button class="btn btn-ghost btn-sm" id="cqStop">Detener</button></div>
      ${a ? `<div class="small" style="margin-top:6px">Ahora: <b>${esc(a.nombre)}</b> · <span class="mono">${esc(a.doc)}</span></div>` : ""}
      ${c.ultimo ? `<div class="xs muted" style="margin-top:4px">${esc(c.ultimo)}</div>` : ""}
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-sm" id="cqOpen">${I.link}Abrir Procuraduría</button><button class="btn btn-sm" id="cqSkip">Saltar persona</button></div>`;
    $("#cqStop", box).addEventListener("click", finCola);
    $("#cqOpen", box).addEventListener("click", abrirProcu);
    $("#cqSkip", box).addEventListener("click", () => { c.i++; c.ultimo = `Saltada: ${a ? a.nombre : ""}`; siguienteEnCola(); });
  }

  function viewAntecedentes(v) {
    const todos = sujetos();
    const tab = ANT_TABS.find((t) => t[0] === state.antTab) || ANT_TABS[0];
    const q = state.antQ.toLowerCase();
    const rows = todos.filter(tab[2]).filter((s) => !q || [s.nombre, s.doc, s.rol].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (!a.ult) - (!b.ult) ? (!b.ult) - (!a.ult) : a.nombre.localeCompare(b.nombre));
    const hist = (S.consultas || []).slice(0, 30);
    const quien = (c) => (c.cliente ? cust(c.cliente).nombre : (S.personal || []).find((p) => p.id === c.personal)?.nombre || "Persona retirada");
    v.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><h3>Antecedentes en la Procuraduría</h3><span class="badge b-ok">Gratis · página oficial</span></div>
        <div class="stack" style="padding:16px 20px">
          <p class="small muted" style="max-width:75ch">Valida la cédula de clientes y del personal. Una persona del equipo hace la consulta en la página oficial y el panel lee el resultado: separa nombres y apellidos, revisa que la cédula y el nombre coincidan y guarda el soporte con fecha y quién consultó.</p>
          <div class="ant-fav-box">
            <div class="grow"><b class="small">Una sola vez: arrastra este botón a tu barra de favoritos</b><div class="xs subtle">Si no ves la barra, presiona Ctrl+Shift+B. Con él no tienes que copiar ni pegar nada.</div></div>
            ${marcadorHTML()}
          </div>
          <div class="ant-steps">
            <div><b>1</b><span>Pulsa <b>Consultar</b> (o <b>Consultar pendientes seguidas</b>): se abre la Procuraduría.</span></div>
            <div><b>2</b><span>Allí pulsa <b>⭐ RodaRent</b>: se llena la cédula sola.</span></div>
            <div><b>3</b><span>Responde la pregunta del sitio y pulsa <b>Consultar</b>.</span></div>
            <div><b>4</b><span>Pulsa otra vez <b>⭐ RodaRent</b>: el resultado llega al panel y se guarda.</span></div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="anSeg">${I.shield}Consultar pendientes seguidas (${todos.filter((x) => !x.ult).length})</button>
            <button class="btn" id="anAdd">${I.plus}Agregar persona del personal</button>
            <button class="btn" id="anImp">${I.doc}Importar lista (CSV o Excel)</button>
            <button class="btn" id="anXls">${I.out}Descargar reporte Excel</button>
            <input type="file" id="anImpFile" accept=".csv,.txt,.xlsx,.xls" hidden>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="tabs" style="padding:0 12px">${ANT_TABS.map(([k, l, f]) => `<button data-t="${k}" class="${tab[0] === k ? "active" : ""}">${l}<span class="count">${todos.filter(f).length}</span></button>`).join("")}</div>
        <div class="toolbar"><div class="search-in">${I.search}<input class="input" id="antQ" placeholder="Buscar por nombre, cédula o cargo" value="${esc(state.antQ)}"></div><span class="grow"></span><span class="xs subtle">${rows.length} personas</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Persona</th><th>Tipo</th><th>Cédula</th><th>Resultado</th><th>Nombre en el certificado</th><th>Consultado</th><th></th></tr></thead>
        <tbody>${rows.map((s) => `<tr>
          <td><div class="cell-main">${esc(s.nombre)}</div><div class="cell-sub">${esc(s.tel || "")}</div></td>
          <td><span class="badge plain ${s.tipo === "personal" ? "b-brand" : "b-neutral"}">${esc(s.rol)}</span></td>
          <td class="mono small">${esc(s.doc || "—")}</td>
          <td>${antBadge(s.ult)}${s.ult && s.ult.coincideNombre === false ? ' <span class="badge b-danger">Nombre distinto</span>' : ""}</td>
          <td class="small">${s.ult && s.ult.nombre ? esc(s.ult.nombre) : '<span class="subtle">—</span>'}</td>
          <td class="small muted">${s.ult ? RR.relTime(s.ult.fecha) : "—"}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm ${s.ult ? "" : "btn-primary"}" data-ant="${s.tipo}:${s.id}">${I.shield}${s.ult ? "Consultar de nuevo" : "Consultar"}</button>${s.tipo === "personal" ? ` <button class="btn btn-sm btn-ghost btn-icon" data-quitar="${s.id}" title="Quitar del personal" aria-label="Quitar del personal">${I.x}</button>` : ""}</td></tr>`).join("")}</tbody></table>
        ${rows.length ? "" : '<div class="empty">No hay personas en esta lista.</div>'}</div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>Historial de consultas</h3><span class="xs subtle">Últimas ${hist.length}</span></div>
        ${hist.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Persona</th><th>Cédula</th><th>Resultado</th><th>Detalle</th><th>Consultó</th><th>Soporte</th></tr></thead>
        <tbody>${hist.map((c) => `<tr><td class="small">${RR.fmtDT(c.fecha)}</td><td class="small">${esc(quien(c))}</td><td class="mono small">${esc(c.doc)}</td><td>${antBadge(c)}</td>
          <td class="xs muted" style="max-width:340px">${esc(c.detalle)}</td><td class="small">${esc(c.actor)}</td>
          <td>${c.archivo ? `<a class="small" style="color:var(--brand);font-weight:600" href="/api/admin/antecedentes/${c.id}" target="_blank" rel="noopener">${c.archivo.tipo === "application/pdf" ? "Ver PDF" : "Ver captura"}</a>` : '<span class="xs subtle">Texto</span>'}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Todavía no hay consultas.</div>'}
      </div>`;
    $$(".tabs button", v).forEach((b) => b.addEventListener("click", () => { state.antTab = b.dataset.t; viewAntecedentes(v); }));
    const qi = $("#antQ", v);
    qi.addEventListener("input", () => { state.antQ = qi.value; const p = qi.selectionStart; viewAntecedentes(v); const n = $("#antQ", v); n.focus(); n.setSelectionRange(p, p); });
    $$("[data-ant]", v).forEach((b) => b.addEventListener("click", () => { const [t, i] = b.dataset.ant.split(":"); consultarAntecedentes(t, i); }));
    $$("[data-quitar]", v).forEach((b) => b.addEventListener("click", async () => {
      const p = (S.personal || []).find((x) => x.id === b.dataset.quitar);
      if (p && (await pregunta(`¿Quitar a ${p.nombre} del personal?`, "Sus consultas anteriores se conservan en el historial.", "Quitar", true))) { await act("quitar_personal", { id: p.id }, "Persona quitada"); refresh(); }
    }));
    $("#anAdd", v).addEventListener("click", agregarPersonal);
    $("#anSeg", v).addEventListener("click", () => consultarSeguido(todos.filter((x) => !x.ult)));
    bindMarcador(v);
    $("#anImp", v).addEventListener("click", () => $("#anImpFile", v).click());
    $("#anImpFile", v).addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importarLista(f); });
    $("#anXls", v).addEventListener("click", () => reporteExcel(rows));
  }

  /* ---------- Utilidades de archivos (librerías cargadas solo cuando se usan) ---------- */
  const scripts = {};
  const cargarScript = (src) => (scripts[src] ||= new Promise((ok, ko) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => { delete scripts[src]; ko(new Error("No se pudo cargar un componente. Revisa la conexión a internet.")); };
    document.head.appendChild(s);
  }));
  async function textoDePdf(file) {
    await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      out += tc.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n";
    }
    return out;
  }
  const base64De = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => ko(new Error("No se pudo leer el archivo")); r.readAsDataURL(file); });
  function descargar(blob, nombre) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- Consultar a una persona ---------- */
  function consultarAntecedentes(tipo, id) {
    const s = sujetoDe(tipo, id); if (!s) return;
    let archivo = null, texto = "", lectura = null, temp = null;
    const pideAut = !s.consent;
    const m = RR.openModal(`<div class="modal-head"><div><h2>Antecedentes · ${esc(s.nombre)}</h2><div class="xs subtle" style="margin-top:4px">${esc(s.rol)} · Procuraduría General de la Nación</div></div><button class="btn btn-ghost btn-icon" data-close aria-label="Cerrar">${I.x}</button></div>
      <div class="modal-body stack">
        <div class="ant-box"><div class="ant-n">1</div><div class="grow stack" style="gap:8px">
          <div>Abre la Procuraduría para la cédula <b class="mono" style="font-size:16px">${esc(s.doc)}</b>.</div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="anOpen">${I.link}Abrir Procuraduría</button><button class="btn btn-sm" id="anCopy">Copiar cédula</button></div>
          <div class="xs subtle">Allí pulsa <b>⭐ RodaRent</b> (llena la cédula), responde la pregunta, pulsa Consultar y otra vez <b>⭐ RodaRent</b>: el resultado aparece aquí solo.</div></div></div>
        <div class="ant-box"><div class="ant-n">2</div><div class="grow stack" style="gap:8px">
          <div class="row between" style="gap:8px;flex-wrap:wrap"><span>Resultado <span class="xs subtle">(llega solo con ⭐ RodaRent, o pégalo / sube el PDF)</span></span><button class="btn btn-sm" id="anPaste">Pegar resultado</button></div>
          <textarea class="textarea" id="anTxt" rows="4" placeholder="Pega aquí la página de resultados…"></textarea>
          <label class="ant-drop" id="anDrop"><input type="file" id="anFile" accept="application/pdf,image/png,image/jpeg,image/webp" hidden>${I.doc}<span id="anFileTxt">Arrastra el certificado PDF o una captura, o haz clic para elegirlo</span></label></div></div>
        <div id="anRes"></div>
        ${pideAut ? `<label class="check"><input type="checkbox" id="anAut"><span>Confirmo que ${s.tipo === "cliente" ? "el cliente" : "la persona"} autorizó consultar sus antecedentes (Ley 1581 de 2012). Quedará registrado a mi nombre.</span></label>` : ""}
      </div>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-success" id="anSave" disabled>${I.check}Guardar resultado</button></div>`, { onClose: () => { if (procu.actual && procu.actual.modal === s.id) procu.actual = null; } });
    if (procu.cola) { procu.cola = null; $("#rrCola")?.remove(); }
    m.el.querySelector(".modal").style.maxWidth = "620px";
    const copiar = () => navigator.clipboard?.writeText(s.doc).then(() => RR.toast(`Cédula ${s.doc} copiada`), () => {});
    $("#anCopy", m.el).addEventListener("click", copiar);
    $("#anOpen", m.el).addEventListener("click", abrirProcu);
    $("#anPaste", m.el).addEventListener("click", async () => {
      try { const t = await navigator.clipboard.readText(); if (!t.trim()) throw 0; texto = t; $("#anTxt", m.el).value = t; leer(); }
      catch (e) { RR.toast("No pude leer el portapapeles. Pégalo con Ctrl+V en el cuadro.", true); $("#anTxt", m.el).focus(); }
    });
    // Resultado enviado desde la Procuraduría con el botón ⭐ RodaRent.
    procu.actual = {
      doc: s.doc, nombre: s.nombre, modal: s.id,
      recibir: async (t) => {
        texto = t; $("#anTxt", m.el).value = t; await leer(); window.focus();
        if (!lectura || !lectura.documento) return { guardado: false, mensaje: "No encontré el resultado en esta página. Pulsa Consultar primero y luego ⭐ RodaRent." };
        if (!lectura.coincide_documento) return { guardado: false, mensaje: `Este resultado es de la cédula ${lectura.documento}, no de ${s.doc}.` };
        if (pideAut && !$("#anAut", m.el).checked) return { guardado: false, mensaje: `Resultado enviado al panel (${ANT[lectura.estado][0]}). Marca allí la autorización y pulsa «Guardar resultado».` };
        const g = await guardar();
        return g ? { guardado: true, mensaje: `✓ Guardado en RodaRent: ${s.nombre} · ${ANT[g.lectura.estado][0]}${g.marcado ? " · requisito verificado" : ""}.` } : { guardado: false, mensaje: "No se pudo guardar. Revisa el panel." };
      },
    };
    const listo = () => { $("#anSave", m.el).disabled = !(lectura && lectura.coincide_documento && (!pideAut || $("#anAut", m.el).checked)); };
    if (pideAut) $("#anAut", m.el).addEventListener("change", listo);

    function pintar(l) {
      const r = $("#anRes", m.el);
      if (!l) { r.innerHTML = ""; return; }
      const [lab, cls] = ANT[l.estado];
      const fila = (k, val) => `<dt>${k}</dt><dd>${val || '<span class="subtle">—</span>'}</dd>`;
      r.innerHTML = `<div class="ant-result ${cls}">
        <div class="row between" style="gap:8px;flex-wrap:wrap"><b>Resultado leído</b><span class="badge ${cls}">${lab}</span></div>
        <dl class="kv" style="margin-top:10px">${fila("Primer nombre", esc(l.primer_nombre))}${fila("Segundo nombre", esc(l.segundo_nombre))}${fila("Primer apellido", esc(l.primer_apellido))}${fila("Segundo apellido", esc(l.segundo_apellido))}
          ${fila("Cédula", l.documento ? `<span class="mono">${esc(l.documento)}</span> ${l.coincide_documento ? '<span class="badge b-ok">Coincide</span>' : '<span class="badge b-danger">No coincide</span>'}` : "")}
          ${fila("Nombre registrado", esc(s.nombre) + (l.coincide_nombre === true ? ' <span class="badge b-ok">Coincide</span>' : l.coincide_nombre === false ? ' <span class="badge b-danger">No coincide</span>' : ""))}
          ${l.fecha_consulta ? fila("Fecha de consulta", esc(l.fecha_consulta)) : ""}</dl>
        <p class="xs muted" style="margin-top:8px">${esc(l.detalle)}</p>
        ${s.tipo === "cliente" && l.estado === "limpio" && l.coincide_nombre !== false ? '<p class="xs" style="margin-top:6px">Al guardar, el requisito «Antecedentes» del cliente quedará verificado.</p>' : ""}
        ${l.estado === "con_antecedentes" ? '<p class="xs" style="margin-top:6px">Nada se rechaza automáticamente: revisa el certificado y decide tú.</p>' : ""}</div>`;
    }
    async function leer() {
      clearTimeout(temp);
      if (texto.trim().length < 10) { lectura = null; pintar(null); listo(); return; }
      try {
        const r = await RR.api("/api/admin/accion", { tipo: "leer_antecedentes", sujeto: s.tipo, id: s.id, texto: texto.slice(0, 60000) });
        lectura = r.lectura; pintar(lectura);
      } catch (e) { lectura = null; $("#anRes", m.el).innerHTML = `<div class="callout err">${I.alert}<span>${esc(e.message)}</span></div>`; }
      listo();
    }
    $("#anTxt", m.el).addEventListener("input", (e) => { texto = e.target.value; clearTimeout(temp); temp = setTimeout(leer, 350); });
    async function usarArchivo(f) {
      if (f.size > 2 * 1024 * 1024) { RR.toast("El archivo supera 2 MB", true); return; }
      archivo = { nombre: f.name, tipo: f.type, base64: await base64De(f) };
      $("#anFileTxt", m.el).textContent = `Adjunto: ${f.name}`;
      if (f.type === "application/pdf") {
        $("#anRes", m.el).innerHTML = '<div class="xs subtle">Leyendo el PDF…</div>';
        try { texto = await textoDePdf(f); $("#anTxt", m.el).value = texto.trim(); leer(); }
        catch (e) { $("#anRes", m.el).innerHTML = `<div class="callout warn">${I.alert}<span>${esc(e.message)} Pega el texto de la página de resultados.</span></div>`; }
      } else if (!texto) {
        $("#anRes", m.el).innerHTML = `<div class="callout warn">${I.alert}<span>La captura queda como soporte. Pega también el texto de la página (Ctrl+A, Ctrl+C) para leer el resultado.</span></div>`;
      }
    }
    const drop = $("#anDrop", m.el);
    $("#anFile", m.el).addEventListener("change", (e) => e.target.files[0] && usarArchivo(e.target.files[0]));
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && usarArchivo(e.dataTransfer.files[0]));

    async function guardar() {
      const b = $("#anSave", m.el); b.disabled = true; b.textContent = "Guardando…";
      const r = await act("guardar_antecedentes", { sujeto: s.tipo, id: s.id, texto: texto.slice(0, 60000), autorizado: pideAut ? $("#anAut", m.el).checked : false, ...(archivo ? { archivo } : {}) });
      if (r) { m.close(); RR.toast(`${ANT[r.lectura.estado][0]} · ${s.nombre}${r.marcado ? " · requisito verificado" : ""}`); refresh(); }
      else { b.disabled = false; b.innerHTML = `${I.check}Guardar resultado`; }
      return r;
    }
    $("#anSave", m.el).addEventListener("click", guardar);
    setTimeout(() => $("#anTxt", m.el).focus(), 50);
  }

  /* ---------- Personal ---------- */
  function agregarPersonal() {
    const m = RR.openModal(`<div class="modal-head"><h2>Agregar persona del personal</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Cerrar">${I.x}</button></div>
      <form class="modal-body stack" id="pfForm">
        <div class="field"><label for="pfNom">Nombre completo</label><input class="input" id="pfNom" required maxlength="120"></div>
        <div class="field"><label for="pfDoc">Cédula</label><input class="input" id="pfDoc" required inputmode="numeric" maxlength="15"></div>
        <div class="field"><label for="pfCar">Cargo</label><input class="input" id="pfCar" maxlength="60" placeholder="Ej.: conductor, asesor, lavado"></div>
        <div class="field"><label for="pfTel">Celular (opcional)</label><input class="input" id="pfTel" maxlength="20" inputmode="tel"></div>
      </form>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="pfOk">Guardar</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "460px";
    const guardar = async () => {
      const d = { nombre: $("#pfNom", m.el).value.trim(), documento: $("#pfDoc", m.el).value.trim(), cargo: $("#pfCar", m.el).value.trim(), telefono: $("#pfTel", m.el).value.trim() || undefined };
      if (d.nombre.length < 3 || docNum(d.documento).length < 5) { RR.toast("Escribe el nombre y una cédula válida", true); return; }
      if (await act("guardar_personal", d, `${d.nombre} agregado al personal`)) { m.close(); state.antTab = "personal"; refresh(); }
    };
    $("#pfOk", m.el).addEventListener("click", guardar);
    $("#pfForm", m.el).addEventListener("submit", (e) => { e.preventDefault(); guardar(); });
    setTimeout(() => $("#pfNom", m.el).focus(), 50);
  }

  async function importarLista(file) {
    let filas = [];
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
        const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        filas = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      } else {
        const txt = await file.text();
        const sep = [";", "\t", ","].find((c) => txt.split(/\r?\n/)[0].includes(c)) || ",";
        filas = txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, "")));
      }
    } catch (e) { RR.toast(e.message || "No se pudo leer el archivo", true); return; }
    if (!filas.length) { RR.toast("El archivo está vacío", true); return; }
    // Encabezados: busca columnas de cédula, nombre y cargo; si no hay encabezado, la primera columna es la cédula.
    const enc = filas[0].map((h) => String(h).toLowerCase());
    const conEnc = enc.some((h) => /c[eé]dula|documento|^id$|nombre|cargo/.test(h));
    const col = (re, def) => { const i = enc.findIndex((h) => re.test(h)); return i >= 0 ? i : def; };
    const cDoc = conEnc ? col(/c[eé]dula|documento|^id$|identificaci/, 0) : 0, cNom = conEnc ? col(/nombre/, -1) : -1, cCar = conEnc ? col(/cargo/, -1) : -1;
    const lista = (conEnc ? filas.slice(1) : filas).map((f) => ({ documento: docNum(f[cDoc]), nombre: cNom >= 0 ? String(f[cNom] || "").trim() || undefined : undefined, cargo: cCar >= 0 ? String(f[cCar] || "").trim() || undefined : undefined }))
      .filter((f) => f.documento.length >= 5 && f.documento.length <= 15);
    const unicos = [...new Map(lista.map((f) => [f.documento, f])).values()].slice(0, 500);
    const clientes = new Set(S.customers.map((c) => docNum(c.doc)));
    const nuevos = unicos.filter((f) => !clientes.has(f.documento));
    if (!nuevos.length) { RR.toast(unicos.length ? "Esas cédulas ya están registradas como clientes" : "No se encontraron cédulas válidas en el archivo", true); return; }
    if (!(await RR.confirm(`¿Importar ${nuevos.length} cédula(s) al personal?`, `Se leyeron de «${file.name}».${unicos.length - nuevos.length ? ` ${unicos.length - nuevos.length} ya son clientes y se omiten.` : ""} Las que no traen nombre quedan como «Por identificar» y toman el nombre del certificado al consultarlas.`, "Importar"))) return;
    const r = await act("importar_personal", { filas: nuevos });
    if (r) { RR.toast(`${r.nuevos} nueva(s) · ${r.total - r.nuevos} ya estaban`); state.antTab = "sin"; refresh(); }
  }

  /* ---------- Reporte Excel (mismas columnas y colores del programa de consulta masiva) ---------- */
  async function reporteExcel(rows) {
    try { await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"); }
    catch (e) { RR.toast(e.message, true); return; }
    const wb = new window.ExcelJS.Workbook();
    const ws = wb.addWorksheet("Antecedentes");
    ws.columns = [
      ["Cédula", 16], ["Primer Nombre", 18], ["Segundo Nombre", 18], ["Primer Apellido", 18], ["Segundo Apellido", 18], ["Nombre Completo", 34],
      ["Tipo", 16], ["Estado Disciplinario", 22], ["Coincide nombre", 16], ["Detalle del Resultado", 50], ["Consultó", 24], ["Fecha y Hora", 20],
    ].map(([header, width]) => ({ header, width }));
    rows.forEach((s) => {
      const c = s.ult;
      const fila = ws.addRow([s.doc, ...(c ? c.nombres : ["", "", "", ""]), c?.nombre || s.nombre, s.rol, c ? ANT[c.estado][2] : "SIN CONSULTAR",
        c ? (c.coincideNombre === true ? "Sí" : c.coincideNombre === false ? "No" : "—") : "", c?.detalle || "", c?.actor || "", c ? new Date(c.fecha).toLocaleString("es-CO") : ""]);
      const color = c ? ANT[c.estado][3] : "F2F2F2";
      fila.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + color } }; cell.alignment = { wrapText: true, vertical: "top" }; });
    });
    ws.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2C59" } }; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.alignment = { horizontal: "center", vertical: "middle" }; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `antecedentes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    RR.toast(`Reporte con ${rows.length} persona(s) descargado`);
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
            <div class="verif-row"><span>Consulta de antecedentes y licencia</span>${c.consent?.antecedentes ? `<span class="badge b-ok">Otorgado</span>` : `<span class="badge b-neutral">No otorgado</span>`}</div></div>
          ${isAdmin() ? `<div class="dsec"><h4>Verificación con fuentes oficiales</h4>
            ${S.verifikActivo ? `<button class="btn btn-sm" id="dcVerif">${I.shield}Verificar licencia y antecedentes</button><p class="xs subtle" style="margin-top:6px">Consulta RUNT, Policía y Procuraduría vía Verifik. Solo marca como verificado lo que la fuente confirma; lo demás queda para tu revisión.</p>` : `<p class="xs subtle">Consulta automática (Verifik) no configurada.</p>`}
            <button class="btn btn-sm" id="dcProcu" style="margin-top:8px">${I.shield}Consultar en la Procuraduría (gratis)</button>
            ${(() => { const u = ultimaConsulta("cliente", c.id); return u ? `<div class="xs subtle" style="margin-top:6px">Última consulta en la Procuraduría: ${antBadge(u)} ${RR.relTime(u.fecha)}</div>` : ""; })()}
            ${(() => { const vs = (S.verificaciones || []).filter((x) => x.cliente === c.id); const col = { ok: "b-ok", hallazgo: "b-danger", no_encontrado: "b-warn", error: "b-warn", no_aplica: "b-neutral" }; const lab = { ok: "Sin novedad", hallazgo: "Revisar", no_encontrado: "Sin datos", error: "Falló", no_aplica: "No aplica" };
              return vs.length ? `<div style="margin-top:10px">${vs.slice(0, 8).map((x) => `<div class="verif-row" style="align-items:flex-start"><div><b class="small">${esc(x.fuente)}</b><div class="xs muted">${esc(x.detalle)}</div><div class="xs subtle">${esc(x.actor)} · ${RR.relTime(x.fecha)}</div></div><span class="badge ${col[x.resultado]}">${lab[x.resultado]}</span></div>`).join("")}</div>` : ""; })()}
          </div>` : ""}
          <div class="dsec"><h4>Historial · ${rs.length} solicitudes · ${alq.length} alquileres</h4>
            ${rs.length ? rs.map((r) => `<div class="list-item" style="padding:10px 0" data-res="${r.id}"><div class="mini-car" style="width:52px">${RR.carSVG(veh(r.vehiculo).tipo, veh(r.vehiculo).color)}</div><div class="grow"><div class="small bold">${r.codigo} · ${vname(veh(r.vehiculo))}</div><div class="xs subtle">${RR.fmtDate(r.inicio)} → ${RR.fmtDate(r.fin)} · ${RR.money(r.total)}</div></div>${RR.badge(RR.RES_STATUS, r.estado)}</div>`).join("") : '<div class="empty">Sin solicitudes</div>'}</div>
        </div>
        <div class="drawer-foot"><button class="btn btn-primary" id="dcNew">${I.plus}Nueva reserva para este cliente</button></div>`;
      bindVerif(root, c, draw);
      const bp = $("#dcProcu", root);
      if (bp) bp.addEventListener("click", () => { d.close(); consultarAntecedentes("cliente", c.id); });
      const bv = $("#dcVerif", root);
      if (bv) bv.addEventListener("click", () => {
        const correr = async (autorizado) => {
          bv.disabled = true; bv.textContent = "Consultando fuentes… (puede tardar unos segundos)";
          const r = await act("verificar_fuentes", { clienteId: c.id, autorizado });
          if (r) RR.toast(r.revisar.length ? `Verificado: ${r.verificados.join(", ") || "nada"} · ${r.revisar.length} punto(s) para revisar` : "Licencia, identidad y antecedentes verificados");
          draw();
        };
        if (c.consent?.antecedentes) return correr(false);
        const m = RR.openModal(`<div class="modal-head"><h2>Autorización del cliente</h2></div>
          <div class="modal-body stack"><p class="muted">Para consultar la licencia y los antecedentes de <b>${esc(c.nombre)}</b> necesitas su autorización expresa (Ley 1581 de 2012).</p>
          <label class="check"><input type="checkbox" id="vAut"><span>Confirmo que el cliente autorizó esta consulta. Quedará registrado a mi nombre.</span></label></div>
          <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="vOk" disabled>Consultar</button></div>`);
        m.el.querySelector(".modal").style.maxWidth = "460px";
        $("#vAut", m.el).addEventListener("change", (e) => ($("#vOk", m.el).disabled = !e.target.checked));
        $("#vOk", m.el).addEventListener("click", () => { m.close(); correr(true); });
      });
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
        ${c.estado !== "humano" ? `<button class="btn btn-sm btn-primary" id="cvTake">Tomar conversación</button>` : `<button class="btn btn-sm" id="cvBot">Devolver a la IA</button>`}</div>
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
    $("#cvForm", v).addEventListener("submit", async (e) => { e.preventDefault(); const inp = $("#cvText", v); const t = inp.value.trim(); if (!t) return; inp.disabled = true; if (await act("responder_conv", { id: c.id, texto: t })) { viewConversaciones(v); const n = $("#cvText", v); if (n) n.focus(); } else inp.disabled = false; });
    bindOpeners(v);
  }

  /* =================== AJUSTES =================== */
  function viewAjustes(v) {
    const st = S.settings, ro = !isAdmin(), dis = ro ? "disabled" : "";
    const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${dis}><span></span></label>`;
    const INTEG = [
      S.whatsappActivo
        ? ["WhatsApp Business (Cloud API)", "Conectado", "b-ok", "El asistente responde por WhatsApp y el equipo puede contestar desde Conversaciones"]
        : ["WhatsApp Business (Cloud API)", "Sin configurar", "b-neutral", "Faltan las variables WHATSAPP_* en el servidor (ver guía)"],
      S.iaDisponible
        ? ["Asistente de IA (chat web)", "Conectado", "b-ok", "Responde en el sitio web con datos reales de flota y reservas"]
        : ["Asistente de IA (chat web)", "Sin configurar", "b-warn", "Falta la variable ANTHROPIC_API_KEY en el servidor; mientras tanto los chats pasan a un asesor"],
      ["Base de datos y acceso al panel", "Conectado", "b-ok", "PostgreSQL con bloqueo de reservas duplicadas · sesión segura por usuario"],
      S.verifikActivo
        ? ["Verificación con fuentes oficiales (Verifik)", "Conectado", "b-ok", "Licencia en el RUNT, antecedentes en Policía y Procuraduría, con autorización del cliente"]
        : ["Verificación con fuentes oficiales (Verifik)", "Sin configurar", "b-neutral", "Falta la variable VERIFIK_TOKEN en el servidor"],
      ["Carga de documentos", "Pendiente", "b-neutral", "Hoy se verifican a mano por WhatsApp; siguiente etapa: almacenamiento privado"],
      ["Google Calendar", "No conectado", "b-neutral", "Requiere OAuth de Google Cloud · Etapa 6"],
      ["Correo transaccional", "No conectado", "b-neutral", "Confirmaciones y recordatorios por correo · Etapa 6"],
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
          <div class="set-row"><div><b>Exigir antecedentes verificados</b><div class="xs subtle">Para aprobar, el cliente debe tener antecedentes verificados: consulta gratis en la Procuraduría desde la sección Antecedentes${S.verifikActivo ? ", o automática con Verifik" : ""}.</div></div>${sw("sAnt", st.antecedentesActiva)}</div>
        </div>
        <div class="card"><div class="card-head"><h3>Pre-reservas y recordatorios</h3></div>
          <div class="set-row"><div><b>Vencimiento de pre-reserva</b><div class="xs subtle">Tiempo que una solicitud bloquea el vehículo</div></div><select class="select" id="sPre" ${dis}>${[6, 12, 24, 48].map((h) => `<option value="${h}" ${st.prereservaHoras === h ? "selected" : ""}>${h} horas</option>`).join("")}</select></div>
          <div class="set-row"><div><b>Recordatorio de entrega</b><div class="xs subtle">Horas antes de la recogida</div></div><select class="select" id="sRec" ${dis}>${[2, 12, 24, 48].map((h) => `<option value="${h}" ${st.recordatorioHoras === h ? "selected" : ""}>${h} horas</option>`).join("")}</select></div>
          <div class="set-row"><div><b>Retención de documentos</b><div class="xs subtle">Días después de finalizar el servicio</div></div><select class="select" id="sRet" ${dis}>${[30, 60, 90, 180].map((h) => `<option value="${h}" ${st.retencionDias === h ? "selected" : ""}>${h} días</option>`).join("")}</select></div>
        </div>
        ${ro ? "" : `<div class="row" style="justify-content:flex-end"><button class="btn btn-primary" id="sSave">Guardar configuración</button></div>`}
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Integraciones</h3><span class="xs subtle">Estado actual del servidor</span></div>
          ${INTEG.map(([n, s, cls, d]) => `<div class="set-row"><div><b>${n}</b><div class="xs subtle">${d}</div></div><span class="badge ${cls}">${s}</span></div>`).join("")}
          ${ro ? "" : `<div class="set-row" style="flex-direction:column;align-items:stretch"><button class="btn btn-sm" id="waTest">Probar conexión con WhatsApp</button><div id="waTestOut"></div></div>`}</div>
        <div class="card"><div class="card-head"><h3>Usuarios y roles</h3></div>
          <div class="set-row"><div class="row" style="gap:10px">${avatar(me.nombre)}<div><b>${esc(me.nombre)}</b><div class="xs subtle">Sesión actual</div></div></div><span class="badge ${isAdmin() ? "b-brand" : "b-ok"}">${me.rol}</span></div>
          <div class="set-row"><div class="small muted"><b>Administrador:</b> aprueba, verifica requisitos, edita flota y ajustes.<br><b>Operador:</b> gestiona reservas y conversaciones; ve documentos enmascarados.</div></div>
        </div>
        <div class="card"><div class="card-head"><h3>Registro de actividad</h3><span class="xs subtle">Auditoría de acciones administrativas</span></div>
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
    $("#sSave", v).addEventListener("click", () => {
      const cats = $$("[data-cat]", v).filter((c) => c.checked).map((c) => c.dataset.cat);
      if (!cats.length) return RR.toast("Selecciona al menos una categoría de licencia", true);
      Object.assign(st, { edadMinima: +$("#sEdad", v).value, licenciaVigente: $("#sLic", v).checked, categorias: cats, depositoObligatorio: $("#sDep", v).checked, experienciaActiva: $("#sExpOn", v).checked, experienciaMin: +$("#sExp", v).value, docAdicional: $("#sDoc", v).checked, prereservaHoras: +$("#sPre", v).value, recordatorioHoras: +$("#sRec", v).value, retencionDias: +$("#sRet", v).value, antecedentesActiva: $("#sAnt", v) ? $("#sAnt", v).checked : !!st.antecedentesActiva });
      act("ajustes", { data: { edadMinima: st.edadMinima, licenciaVigente: st.licenciaVigente, categorias: st.categorias, depositoObligatorio: st.depositoObligatorio, experienciaActiva: st.experienciaActiva, experienciaMin: st.experienciaMin, docAdicional: st.docAdicional, prereservaHoras: st.prereservaHoras, recordatorioHoras: st.recordatorioHoras, retencionDias: st.retencionDias, antecedentesActiva: !!st.antecedentesActiva } }, "Configuración guardada").then(() => viewAjustes(v));
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
