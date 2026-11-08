/* RodaRent — sitio público + asistente simulado */
(function () {
  const S = RR.store.load();
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const I = RR.icon;

  /* ---------- Iconos estáticos ---------- */
  $("#logoMark").innerHTML = I.car;
  ["#waIc1", "#waIc2", "#waIc3"].forEach((id) => ($(id).innerHTML = I.wa.replace("<svg", '<svg width="18" height="18"')));
  $("#fabIc").innerHTML = I.wa;
  $("#fIc1").innerHTML = I.check;
  $("#fIc2").innerHTML = I.chat;
  $("#heroCar").innerHTML = RR.carSVG("suv", "#2546d8");
  $("#trust").innerHTML = [["shield", "Seguro todo riesgo"], ["check", "Kilometraje libre en Antioquia"], ["clock", "Atención inmediata"]].map(([i, t]) => `<span>${I[i]}${t}</span>`).join("");

  /* ---------- Búsqueda ---------- */
  const search = { loc: RR.BUSINESS.locations[0], start: null, end: null, type: "all", searched: false };
  const t0 = RR.addDays(RR.startOfDay(new Date()), 1); t0.setHours(9);
  const t1 = RR.addDays(t0, 3);
  search.start = t0.toISOString(); search.end = t1.toISOString();
  $("#sLoc").innerHTML = RR.BUSINESS.locations.map((l) => `<option>${RR.esc(l)}</option>`).join("");
  $("#sStart").value = RR.toLocalInput(t0);
  $("#sEnd").value = RR.toLocalInput(t1);
  $("#sStart").min = RR.toLocalInput(new Date());

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = new Date($("#sStart").value), b = new Date($("#sEnd").value);
    if (!(b > a)) { $("#sEnd").classList.add("invalid"); RR.toast("La devolución debe ser posterior a la recogida", true); return; }
    $("#sEnd").classList.remove("invalid");
    Object.assign(search, { loc: $("#sLoc").value, start: a.toISOString(), end: b.toISOString(), searched: true });
    renderGrid();
    document.getElementById("vehiculos").scrollIntoView({ behavior: "smooth" });
  });

  const TYPES = [["all", "Todos"], ["hatch", "Económicos"], ["sedan", "Sedán"], ["suv", "SUV"], ["pickup", "Camioneta"], ["van", "Van"]];
  function renderChips() {
    $("#chips").innerHTML = TYPES.map(([k, l]) => `<button class="chip ${search.type === k ? "active" : ""}" data-type="${k}">${l}</button>`).join("");
    $$("#chips .chip").forEach((b) => b.addEventListener("click", () => { search.type = b.dataset.type; renderChips(); renderGrid(); }));
  }

  const specs = (v) => `<div class="specs"><span>${I.users}${v.capacidad} puestos</span><span>${I.gear}${v.transmision}</span><span>${I.fuel}${v.combustible}</span><span>${I.bag}${v.maletas} maletas</span></div>`;

  function renderGrid() {
    const dias = RR.days(search.start, search.end);
    const list = S.vehicles.filter((v) => v.estado !== "inactivo" && (search.type === "all" || v.tipo === search.type));
    const avail = list.filter((v) => RR.isAvailable(v, search.start, search.end));
    $("#availNote").innerHTML = `${I.cal}<span><b>${avail.length} de ${list.length}</b> disponibles del <b>${RR.fmtDT(search.start)}</b> al <b>${RR.fmtDT(search.end)}</b> (${dias} ${dias === 1 ? "día" : "días"})</span>`;
    list.sort((a, b) => RR.isAvailable(b, search.start, search.end) - RR.isAvailable(a, search.start, search.end) || a.precio - b.precio);
    $("#grid").innerHTML = list.map((v) => {
      const ok = RR.isAvailable(v, search.start, search.end);
      const why = v.estado === "mantenimiento" ? "En mantenimiento" : "No disponible en esas fechas";
      return `<article class="card car ${ok ? "" : "unavailable"}">
        <div class="car-art">${ok ? '<span class="badge b-ok">Disponible</span>' : `<span class="badge b-neutral">${why}</span>`}${v.destacado && ok ? `<span class="tag-hot">${v.destacado}</span>` : ""}${RR.carSVG(v.tipo, v.color)}</div>
        <div class="body">
          <div><div class="name">${v.marca} ${v.modelo}</div><div class="small subtle">${RR.TYPE_LABEL[v.tipo]} · ${v.anio}</div></div>
          ${specs(v)}
          <div class="foot">
            <div><div class="price">${RR.money(v.precio)} <small>/ día</small></div><div class="xs muted">Total ${dias} d: <b>${RR.money(v.precio * dias)}</b></div></div>
            <button class="btn ${ok ? "btn-primary" : ""} btn-sm" data-book="${v.id}" ${ok ? "" : "disabled"}>${ok ? "Reservar" : "Ocupado"}</button>
          </div>
        </div>
      </article>`;
    }).join("") || `<div class="empty">No hay vehículos de este tipo.</div>`;
    $$("[data-book]").forEach((b) => b.addEventListener("click", () => openBooking(b.dataset.book)));
  }

  /* ---------- Requisitos, condiciones y FAQ ---------- */
  const st = S.settings;
  $("#reqList").innerHTML = [
    ["user", "Edad mínima", `${st.edadMinima} años cumplidos.`],
    ["doc", "Documento de identidad", "Cédula de ciudadanía o pasaporte vigente (extranjeros)."],
    ["car", "Licencia de conducción vigente", `Categoría ${st.categorias.join(", ")} según el vehículo.`],
    ["shield", "Depósito de garantía", "Reembolsable al devolver el vehículo en buen estado. Monto según el vehículo."],
    ["chat", "Contacto verificable", "Celular con WhatsApp y correo electrónico activos."],
  ].map(([i, t, d]) => `<li><span class="ic">${I[i]}</span><div><b>${t}</b><div class="muted">${d}</div></div></li>`).join("");
  $("#condList").innerHTML = [
    ["clock", "Alquiler por días de 24 horas", "Retrasos mayores a 2 horas pueden cobrarse como día adicional."],
    ["fuel", "Combustible", "Se entrega con tanque lleno y debe devolverse igual."],
    ["pin", "Cobertura", "Kilometraje libre dentro de Antioquia. Viajes fuera del departamento, con previo aviso."],
    ["shield", "Seguro", "SOAT y seguro todo riesgo incluidos, con deducible según póliza."],
    ["x", "Cancelación", "Sin costo hasta 48 horas antes de la recogida."],
  ].map(([i, t, d]) => `<li><span class="ic">${I[i]}</span><div><b>${t}</b><div class="muted">${d}</div></div></li>`).join("");

  const FAQ = [
    ["¿Cuánto tiempo apartan el vehículo?", `Cuando envías tu solicitud, el vehículo queda pre-reservado por ${st.prereservaHoras} horas mientras verificamos tus documentos. Si no se completa en ese plazo, se libera automáticamente.`],
    ["¿Cuándo me devuelven el depósito?", "Se reembolsa al devolver el vehículo, una vez revisado su estado. Si fue con tarjeta, el banco puede tardar de 3 a 8 días hábiles."],
    ["¿Me lo pueden llevar a domicilio o al aeropuerto?", "Sí. Entregamos en el aeropuerto José María Córdova, la Terminal del Sur o a domicilio con un costo adicional."],
    ["¿Puede manejar otra persona?", "Sí, registrándola como conductor adicional. Debe cumplir los mismos requisitos."],
    ["¿Puedo viajar con mascotas?", "Sí, con guacal o cobertor de silla. Se cobra limpieza si el vehículo se devuelve sucio."],
    ["¿Cómo protegen mis datos?", "Solo pedimos lo necesario para el alquiler, con tu autorización y conforme a la Ley 1581 de 2012. Tus documentos se guardan cifrados y se eliminan pasado el periodo de retención."],
  ];
  $("#faqList").innerHTML = FAQ.map(([q, a], i) => `<details class="faq" ${i === 0 ? "open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("");
  $("#privacyLink").addEventListener("click", (e) => { e.preventDefault(); showPrivacy(); });

  function showPrivacy() {
    RR.openModal(`<div class="modal-head"><h2>Autorización de tratamiento de datos</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack small muted">
        <p><b>Texto de ejemplo para la demo.</b> Debe ser revisado por un abogado antes de usarse.</p>
        <p>Autorizo a Autos del Valle a tratar mis datos personales (nombre, documento, contacto, licencia y documentos aportados) con la finalidad exclusiva de gestionar mi solicitud de alquiler, verificar requisitos, celebrar y ejecutar el contrato y enviarme comunicaciones sobre mi reserva.</p>
        <p>Los documentos se almacenan de forma restringida y se eliminan ${st.retencionDias} días después de finalizado el servicio, salvo obligación legal. Puedo conocer, actualizar, rectificar y suprimir mis datos escribiendo al canal de atención.</p>
        <p>Cualquier consulta de antecedentes se hará solo con autorización expresa adicional, finalidad legítima y a través de mecanismos legalmente permitidos.</p>
        <p>Las comunicaciones comerciales (seguimiento, promociones) solo se envían si las autorizo por separado.</p>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-close>Entendido</button></div>`);
  }

  /* ---------- Modal de reserva ---------- */
  function openBooking(vid) {
    const v = RR.get.vehicle(vid);
    const b = { vid, start: search.start, end: search.end, loc: search.loc, step: 1, data: {}, docs: {} };
    const m = RR.openModal(`<div id="bk"></div>`);
    const root = $("#bk", m.el);

    function priceBlock() {
      const d = RR.days(b.start, b.end);
      return `<div class="price-lines">
        <div class="row between"><span class="muted">${RR.money(v.precio)} × ${d} ${d === 1 ? "día" : "días"}</span><span>${RR.money(v.precio * d)}</span></div>
        <div class="row between"><span class="muted">Seguro todo riesgo</span><span class="badge b-ok plain">Incluido</span></div>
        <div class="row between total"><span>Total del alquiler</span><span>${RR.money(v.precio * d)}</span></div>
        <div class="row between small muted"><span>Depósito reembolsable</span><span>${RR.money(v.deposito)}</span></div>
      </div>`;
    }
    const head = (title, sub) => `<div class="modal-head"><div class="grow"><h2>${title}</h2><p class="small muted" style="margin-top:4px">${sub}</p>
      <div class="stepper"><div class="${b.step >= 1 ? "on" : ""}"></div><div class="${b.step >= 2 ? "on" : ""}"></div><div class="${b.step >= 3 ? "on" : ""}"></div></div></div>
      <button class="btn btn-ghost btn-icon" data-x aria-label="Cerrar">${I.x}</button></div>`;

    function render() {
      if (b.step === 1) {
        root.innerHTML = head("Revisa tu reserva", "Paso 1 de 3 · Fechas y precio") + `
          <div class="modal-body stack">
            <div class="sum"><div class="art">${RR.carSVG(v.tipo, v.color)}</div><div><div class="bold">${v.marca} ${v.modelo} · ${v.anio}</div>${specs(v)}</div></div>
            <div class="form-grid">
              <div class="field full"><label>Lugar de recogida</label><select class="select" id="bLoc">${RR.BUSINESS.locations.map((l) => `<option ${l === b.loc ? "selected" : ""}>${RR.esc(l)}</option>`).join("")}</select></div>
              <div class="field"><label>Recogida</label><input class="input" type="datetime-local" id="bStart" value="${RR.toLocalInput(b.start)}"></div>
              <div class="field"><label>Devolución</label><input class="input" type="datetime-local" id="bEnd" value="${RR.toLocalInput(b.end)}"></div>
            </div>
            <div id="bAvail"></div>
            <div id="bPrice">${priceBlock()}</div>
          </div>
          <div class="modal-foot"><button class="btn" data-x>Cancelar</button><button class="btn btn-primary" id="bNext">Continuar ${I.arrow}</button></div>`;
        const check = () => {
          const a = new Date($("#bStart", root).value), e = new Date($("#bEnd", root).value);
          let msg = "", ok = true;
          if (!(e > a)) { ok = false; msg = `<div class="callout err">${I.alert}La devolución debe ser posterior a la recogida.</div>`; }
          else if (!RR.isAvailable(v, a.toISOString(), e.toISOString())) { ok = false; msg = `<div class="callout err">${I.alert}Este vehículo ya está reservado en esas fechas. Prueba otras fechas u otro vehículo.</div>`; }
          else { b.start = a.toISOString(); b.end = e.toISOString(); msg = `<div class="callout">${I.check}<span>¡Disponible! Al enviar la solicitud lo apartamos por <b>${st.prereservaHoras} horas</b> mientras verificamos tus datos.</span></div>`; }
          $("#bAvail", root).innerHTML = msg; $("#bPrice", root).innerHTML = priceBlock(); $("#bNext", root).disabled = !ok;
        };
        $("#bStart", root).addEventListener("change", check); $("#bEnd", root).addEventListener("change", check);
        $("#bLoc", root).addEventListener("change", (e) => (b.loc = e.target.value));
        check();
        $("#bNext", root).addEventListener("click", () => { b.step = 2; render(); });
      } else if (b.step === 2) {
        const d = b.data;
        root.innerHTML = head("Tus datos", "Paso 2 de 3 · Información del conductor principal") + `
          <form class="modal-body stack" id="bForm" novalidate>
            <div class="form-grid">
              <div class="field full"><label for="fName">Nombre completo</label><input class="input" id="fName" value="${RR.esc(d.nombre || "")}" autocomplete="name" placeholder="Como aparece en tu documento"></div>
              <div class="field"><label for="fDoc">Número de documento</label><input class="input" id="fDoc" value="${RR.esc(d.docNum || "")}" inputmode="numeric" placeholder="Cédula o pasaporte"></div>
              <div class="field"><label for="fBirth">Fecha de nacimiento</label><input class="input" type="date" id="fBirth" value="${d.birth || ""}"></div>
              <div class="field"><label for="fTel">Celular (WhatsApp)</label><input class="input" id="fTel" value="${RR.esc(d.tel || "")}" inputmode="tel" autocomplete="tel" placeholder="300 123 4567"></div>
              <div class="field"><label for="fEmail">Correo electrónico</label><input class="input" type="email" id="fEmail" value="${RR.esc(d.email || "")}" autocomplete="email" placeholder="tucorreo@ejemplo.com"></div>
              <div class="field"><label for="fLic">Categoría de licencia</label><select class="select" id="fLic">${["B1", "B2", "C1", "A2", "Otra"].map((c) => `<option ${d.lic === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
              <div class="field"><label for="fLicV">Vencimiento de la licencia</label><input class="input" type="date" id="fLicV" value="${d.licV || ""}"></div>
              <div class="field full"><label>Documentos (opcional ahora, puedes enviarlos después)</label>
                <div class="form-grid">
                  <label class="file-drop ${b.docs.cedula ? "has" : ""}" id="dz1">${I.doc}<span>${b.docs.cedula ? RR.esc(b.docs.cedula) : "Cédula (frente y reverso)"}</span><input type="file" accept="image/*,.pdf" data-doc="cedula"></label>
                  <label class="file-drop ${b.docs.licencia ? "has" : ""}" id="dz2">${I.doc}<span>${b.docs.licencia ? RR.esc(b.docs.licencia) : "Licencia de conducción"}</span><input type="file" accept="image/*,.pdf" data-doc="licencia"></label>
                </div>
                <span class="help">En la demo los archivos no se suben a ningún servidor; solo se registra el nombre.</span>
              </div>
              <div class="field full"><label for="fNotes">Comentarios (opcional)</label><textarea class="textarea" id="fNotes" placeholder="Ej.: necesito silla para bebé">${RR.esc(d.notas || "")}</textarea></div>
              <label class="check full"><input type="checkbox" id="fConsent" ${d.consent ? "checked" : ""}><span>Autorizo el tratamiento de mis datos personales para gestionar esta solicitud, según la <a href="#" id="fPol" style="color:var(--brand);font-weight:600">política de datos</a>.</span></label>
              <label class="check full"><input type="checkbox" id="fMkt" ${d.mkt ? "checked" : ""}><span>Quiero recibir recordatorios y promociones por WhatsApp (opcional).</span></label>
            </div>
            <div id="fErr"></div>
          </form>
          <div class="modal-foot"><button class="btn" id="bBack">${I.back} Atrás</button><button class="btn btn-primary" id="bSend">Enviar solicitud</button></div>`;
        $("#fPol", root).addEventListener("click", (e) => { e.preventDefault(); showPrivacy(); });
        $$("input[type=file]", root).forEach((inp) => inp.addEventListener("change", () => { if (inp.files[0]) { b.docs[inp.dataset.doc] = inp.files[0].name; const l = inp.closest(".file-drop"); l.classList.add("has"); l.querySelector("span").textContent = inp.files[0].name; } }));
        const collect = () => Object.assign(b.data, { nombre: $("#fName", root).value.trim(), docNum: $("#fDoc", root).value.trim(), birth: $("#fBirth", root).value, tel: $("#fTel", root).value.trim(), email: $("#fEmail", root).value.trim(), lic: $("#fLic", root).value, licV: $("#fLicV", root).value, notas: $("#fNotes", root).value.trim(), consent: $("#fConsent", root).checked, mkt: $("#fMkt", root).checked });
        $("#bBack", root).addEventListener("click", () => { collect(); b.step = 1; render(); });
        $("#bSend", root).addEventListener("click", () => {
          collect();
          const d2 = b.data, errs = [];
          $$(".input", root).forEach((i) => i.classList.remove("invalid"));
          const bad = (id, msg) => { $(id, root).classList.add("invalid"); errs.push(msg); };
          if (d2.nombre.split(" ").filter(Boolean).length < 2) bad("#fName", "Escribe tu nombre y apellido.");
          if (!/^[0-9A-Za-z.\-]{5,15}$/.test(d2.docNum)) bad("#fDoc", "Documento inválido.");
          if (!/^\+?[0-9 ]{10,15}$/.test(d2.tel)) bad("#fTel", "Celular inválido (10 dígitos).");
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d2.email)) bad("#fEmail", "Correo inválido.");
          let age = null;
          if (!d2.birth) bad("#fBirth", "Indica tu fecha de nacimiento.");
          else { const bd = new Date(d2.birth); age = Math.floor((Date.now() - bd) / (365.25 * 86400000)); if (age < st.edadMinima) bad("#fBirth", `La edad mínima para alquilar es ${st.edadMinima} años.`); }
          if (!d2.licV) bad("#fLicV", "Indica el vencimiento de tu licencia.");
          else if (new Date(d2.licV) < new Date(b.end)) bad("#fLicV", "Tu licencia debe estar vigente durante todo el alquiler.");
          if (!st.categorias.includes(d2.lic)) errs.push(`Para este vehículo se requiere licencia ${st.categorias.join(", ")}.`);
          if (!d2.consent) errs.push("Debes autorizar el tratamiento de datos para enviar la solicitud.");
          if (errs.length) { $("#fErr", root).innerHTML = `<div class="callout err">${I.alert}<div>${errs.map(RR.esc).join("<br>")}</div></div>`; return; }

          const tel = d2.tel.startsWith("+") ? d2.tel : "+57 " + d2.tel;
          const c = RR.upsertCustomer({ nombre: d2.nombre, doc: "CC " + d2.docNum, tel, email: d2.email, edad: age, licencia: d2.lic, licVence: d2.licV, origen: "web", docs: { ...b.docs }, consent: { datos: new Date().toISOString(), marketing: d2.mkt } });
          // Datos autodeclarados: quedan PENDIENTES hasta revisión humana del documento.
          c.verif = c.verif || {};
          ["identidad", "licencia", "edad", "contacto", "deposito"].forEach((k) => { if (c.verif[k] !== "verificado") c.verif[k] = "pendiente"; });
          const res = RR.createReservation({ cliente: c.id, vehiculo: v.id, inicio: b.start, fin: b.end, lugar: b.loc, origen: "web", notas: d2.notas }, "Cliente (web)");
          if (!res.ok) { $("#fErr", root).innerHTML = `<div class="callout err">${I.alert}${RR.esc(res.error)}</div>`; return; }
          if (Object.keys(b.docs).length) S.notifications.unshift({ fecha: new Date().toISOString(), texto: `${c.nombre} adjuntó documentos (${Object.keys(b.docs).join(", ")})`, leida: false });
          RR.store.save();
          b.res = res.reservation; b.step = 3; render(); renderGrid();
        });
      } else {
        const r = b.res;
        root.innerHTML = `<div class="modal-head"><span></span><button class="btn btn-ghost btn-icon" data-x>${I.x}</button></div>
          <div class="modal-body" style="text-align:center">
            <div class="success-ic">${I.check}</div>
            <h2 style="font-size:22px">¡Solicitud enviada!</h2>
            <p class="muted" style="margin-top:6px">Tu código es <b style="color:var(--text)">${r.codigo}</b></p>
            <div class="card card-pad" style="text-align:left;margin-top:20px">
              <div class="row between"><span class="muted small">Vehículo</span><b class="small">${v.marca} ${v.modelo}</b></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Recogida</span><span class="small">${RR.fmtDT(r.inicio)}</span></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Devolución</span><span class="small">${RR.fmtDT(r.fin)}</span></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Total estimado</span><b class="small">${RR.money(r.total)}</b></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Estado</span>${RR.badge(RR.RES_STATUS, "pendiente")}</div>
            </div>
            <div class="callout warn" style="text-align:left;margin-top:14px">${I.clock}<span>Apartamos el vehículo hasta el <b>${RR.fmtDT(r.expira)}</b> mientras un asesor verifica tus documentos. Te confirmaremos por WhatsApp</span></div>
          </div>
          <div class="modal-foot" style="justify-content:space-between"><a class="btn btn-ghost" href="admin.html">Ver en el panel (demo)</a><button class="btn btn-primary" data-x>Listo</button></div>`;
      }
      $$("[data-x]", root).forEach((x) => x.addEventListener("click", m.close));
    }
    render();
  }

  /* ======================================================================
     ASISTENTE VIRTUAL (SIMULADO)
     Flujo guionado que imita al agente de IA. En la Etapa 5 este motor se
     reemplaza por el modelo de IA conectado a WhatsApp Cloud API.
     ====================================================================== */
  const chat = { open: false, started: false, step: "start", ctx: {}, conv: null, lastQuick: null };
  const panel = $("#chatPanel");

  function openChat() {
    chat.open = true; panel.classList.remove("hidden"); $("#fabHint").classList.add("hidden"); $(".fab .ping").classList.add("hidden");
    if (!chat.started) { buildPanel(); chat.started = true; flow.start(); }
    setTimeout(() => $("#waText") && $("#waText").focus(), 50);
  }
  function closeChat() { chat.open = false; panel.classList.add("hidden"); }
  $("#fab").addEventListener("click", () => (chat.open ? closeChat() : openChat()));
  $$("[data-open-chat]").forEach((b) => b.addEventListener("click", openChat));
  setTimeout(() => $("#fabHint") && $("#fabHint").classList.add("hidden"), 9000);

  function buildPanel() {
    panel.innerHTML = `<div class="wa">
      <div class="wa-head"><div class="wa-avatar">${I.car}</div><div><div class="wa-title">Autos del Valle</div><div class="wa-sub" id="waStatus">en línea · asistente virtual</div></div><button class="x" id="waClose" aria-label="Cerrar">${I.x}</button></div>
      <div class="wa-body" id="waBody"></div>
      <form class="wa-input" id="waForm"><input id="waText" placeholder="Escribe un mensaje" autocomplete="off"><button class="wa-send" aria-label="Enviar">${I.send}</button></form>
      <div class="wa-note">Simulación de WhatsApp · Respuestas guionadas, sin IA conectada</div>
    </div>`;
    $("#waClose").addEventListener("click", closeChat);
    $("#waForm").addEventListener("submit", (e) => { e.preventDefault(); const t = $("#waText").value.trim(); if (!t) return; $("#waText").value = ""; userSays(t); });
  }

  const body = () => $("#waBody");
  const nowT = () => RR.fmtTime(new Date().toISOString());
  const scroll = () => { const b = body(); b.scrollTop = b.scrollHeight; };
  function clearQuick() { $$(".quick, .inline-dates", body()).forEach((q) => q.remove()); }

  function ensureConv() {
    if (chat.conv) return;
    const num = String(Math.floor(100000000 + Math.random() * 899999999)).replace(/(\d{2})(\d{3})(\d{4})/, "$1 $2 $3");
    chat.conv = { id: "k" + Date.now().toString(36), cliente: null, nombre: "Visitante web", tel: "+57 3" + num, estado: "ia", reserva: null, ultima: new Date().toISOString(), noLeidos: 0, demo: true, mensajes: [] };
    S.conversations.unshift(chat.conv);
  }
  function record(emisor, texto) {
    ensureConv();
    chat.conv.mensajes.push({ emisor, texto, fecha: new Date().toISOString() });
    chat.conv.ultima = new Date().toISOString();
    if (emisor === "cliente") chat.conv.noLeidos = (chat.conv.noLeidos || 0) + (chat.conv.estado === "pendiente" ? 1 : 0);
    RR.store.save();
  }

  function addMsg(cls, html, plain) {
    const el = document.createElement("div");
    el.className = "msg " + cls;
    el.innerHTML = `${html}<span class="time">${nowT()}${cls === "out" ? " ✓✓" : ""}</span>`;
    body().appendChild(el); scroll();
    return el;
  }
  function userSays(text) {
    clearQuick();
    addMsg("out", RR.esc(text));
    record("cliente", text);
    handleText(text);
  }

  let queue = Promise.resolve();
  function bot(lines, after) {
    queue = queue.then(async () => {
      for (const line of [].concat(lines)) {
        const typing = document.createElement("div"); typing.className = "typing"; typing.innerHTML = "<i></i><i></i><i></i>";
        body().appendChild(typing); scroll();
        $("#waStatus").textContent = "escribiendo…";
        await new Promise((r) => setTimeout(r, Math.min(1400, 450 + line.length * 12)));
        typing.remove(); $("#waStatus").textContent = "en línea · asistente virtual";
        addMsg("in", line.replace(/\*(.+?)\*/g, "<b>$1</b>"));
        record("ia", line.replace(/\*/g, ""));
      }
      if (after) after();
    });
  }
  function sys(text) { const el = document.createElement("div"); el.className = "msg sys"; el.textContent = text; body().appendChild(el); scroll(); record("sistema", text); }
  function quick(options) {
    chat.lastQuick = options;
    const q = document.createElement("div"); q.className = "quick";
    options.forEach(([label, fn]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { clearQuick(); addMsg("out", RR.esc(label)); record("cliente", label); fn(); }); q.appendChild(b); });
    body().appendChild(q); scroll();
  }

  const nextWeekday = (dow, hour) => { const d = RR.startOfDay(new Date()); let diff = (dow - d.getDay() + 7) % 7; if (diff === 0 || (dow === 6 && d.getDay() >= 5)) diff += 7; d.setDate(d.getDate() + diff); d.setHours(hour); return d; };
  const firstName = () => (chat.ctx.nombre || "").split(" ")[0];

  const flow = {
    start() {
      bot(["¡Hola! 👋 Soy *Roda*, el asistente virtual de Autos del Valle.", "Te ayudo a cotizar y reservar un vehículo en minutos. ¿Para qué lo necesitas?"], () =>
        quick([["🏖️ Turismo o paseo", () => flow.purpose("turismo")], ["💼 Trabajo", () => flow.purpose("trabajo")], ["🎉 Evento especial", () => flow.purpose("evento")], ["💬 Solo quiero cotizar", () => flow.purpose("cotizar")], ["🙋 Hablar con un asesor", flow.human]]));
    },
    purpose(p) {
      chat.ctx.purpose = p; chat.step = "pax";
      const intro = { turismo: "¡Qué buen plan! 😎", trabajo: "Perfecto, te ayudo a que llegues a tiempo.", evento: "¡Genial! Que sea un día especial.", cotizar: "¡Claro! Te muestro opciones y precios." }[p];
      bot([intro + " ¿Cuántas personas viajarán?"], () => quick([["1 a 4", () => flow.pax(4)], ["5", () => flow.pax(5)], ["6 o 7", () => flow.pax(7)], ["8 o más", () => flow.pax(12)]]));
    },
    pax(n) {
      chat.ctx.pax = n; chat.step = "dates";
      const we = nextWeekday(6, 9), weEnd = RR.addDays(we, 2);
      const nw = nextWeekday(1, 8), nwEnd = RR.addDays(nw, 3);
      bot(["Anotado. ¿Qué fechas tienes en mente? 📅"], () => quick([
        [`Fin de semana (${RR.fmtDate(we)})`, () => flow.dates(we, weEnd)],
        [`Próxima semana, 3 días`, () => flow.dates(nw, nwEnd)],
        ["Elegir fechas", flow.pickDates],
      ]));
    },
    pickDates() {
      const a = RR.addDays(RR.startOfDay(new Date()), 1); a.setHours(9); const b2 = RR.addDays(a, 2);
      const box = document.createElement("form"); box.className = "inline-dates";
      box.innerHTML = `<div><label>Recogida</label><input type="datetime-local" name="a" value="${RR.toLocalInput(a)}" required></div>
        <div><label>Devolución</label><input type="datetime-local" name="b" value="${RR.toLocalInput(b2)}" required></div>
        <div><label>Lugar</label><select name="l">${RR.BUSINESS.locations.map((l) => `<option>${RR.esc(l)}</option>`).join("")}</select></div>
        <button class="btn btn-wa btn-sm" type="submit">Buscar disponibilidad</button>`;
      box.addEventListener("submit", (e) => {
        e.preventDefault(); const A = new Date(box.a.value), B = new Date(box.b.value);
        if (!(B > A)) { RR.toast("La devolución debe ser posterior a la recogida", true); return; }
        chat.ctx.loc = box.l.value; clearQuick();
        addMsg("out", `Del ${RR.esc(RR.fmtDT(A.toISOString()))} al ${RR.esc(RR.fmtDT(B.toISOString()))}`); record("cliente", `Del ${RR.fmtDT(A.toISOString())} al ${RR.fmtDT(B.toISOString())}`);
        flow.dates(A, B, true);
      });
      bot(["Elige las fechas aquí 👇"], () => { body().appendChild(box); scroll(); });
    },
    dates(a, b2) {
      chat.ctx.start = new Date(a).toISOString(); chat.ctx.end = new Date(b2).toISOString(); chat.step = "pick";
      const d = RR.days(chat.ctx.start, chat.ctx.end);
      const opts = S.vehicles.filter((v) => v.capacidad >= Math.min(chat.ctx.pax || 1, 12) && RR.isAvailable(v, chat.ctx.start, chat.ctx.end)).sort((x, y) => x.precio - y.precio).slice(0, 4);
      if (!opts.length) {
        bot([`Uy, para esas fechas no me queda nada disponible con esa capacidad 😕`, "¿Probamos otras fechas o te comunico con un asesor?"], () => quick([["Otras fechas", flow.pickDates], ["Hablar con un asesor", flow.human]]));
        return;
      }
      bot([`Revisé la disponibilidad del *${RR.fmtDT(chat.ctx.start)}* al *${RR.fmtDT(chat.ctx.end)}* (${d} ${d === 1 ? "día" : "días"}).`, `Tengo ${opts.length} ${opts.length === 1 ? "opción" : "opciones"} para ti 👇`], () => {
        const wrap = document.createElement("div"); wrap.className = "wa-cars";
        wrap.innerHTML = opts.map((v) => `<div class="wa-car"><div class="art">${RR.carSVG(v.tipo, v.color)}</div><div class="info"><b>${v.marca} ${v.modelo}</b><span class="xs muted">${v.capacidad} puestos · ${v.transmision}</span><span class="small">${RR.money(v.precio)}/día · <b>${RR.money(v.precio * d)}</b> total</span></div><button type="button" data-pick="${v.id}">Elegir este</button></div>`).join("");
        wrap.classList.add("quick"); // se limpia junto con las respuestas rápidas
        wrap.style.display = "flex"; wrap.style.flexWrap = "nowrap";
        body().appendChild(wrap); scroll();
        $$("[data-pick]", wrap).forEach((btn) => btn.addEventListener("click", () => { const v = RR.get.vehicle(btn.dataset.pick); clearQuick(); addMsg("out", `Me interesa el ${v.marca} ${v.modelo}`); record("cliente", `Me interesa el ${v.marca} ${v.modelo}`); flow.pick(v); }));
      });
    },
    pick(v) {
      chat.ctx.vid = v.id; chat.step = "confirm";
      const d = RR.days(chat.ctx.start, chat.ctx.end);
      bot([`¡Excelente elección! 🙌 *${v.marca} ${v.modelo}*\n${d} ${d === 1 ? "día" : "días"} × ${RR.money(v.precio)} = *${RR.money(v.precio * d)}*\nDepósito reembolsable: ${RR.money(v.deposito)}\nSeguro todo riesgo incluido ✅`,
        `Para apartarlo necesito verificar:\n• Cédula\n• Licencia vigente (${st.categorias.join(", ")})\n• Tener ${st.edadMinima} años o más\n• Depósito de garantía`], () =>
        quick([["Continuar con la reserva", flow.askName], ["Ver otras opciones", () => flow.dates(chat.ctx.start, chat.ctx.end)], ["Tengo una pregunta", () => bot(["¡Claro! Escríbeme tu pregunta 😊"])]]));
    },
    askName() { chat.step = "name"; bot(["Perfecto. ¿Cuál es tu *nombre completo*?"]); },
    askDoc() { chat.step = "doc"; bot([`Gracias, ${firstName()} 😊 ¿Cuál es tu número de *cédula*?`]); },
    askConsent() {
      chat.step = "consent";
      bot(["Último paso: para registrar tu solicitud necesito tu autorización para tratar tus datos personales, solo para gestionar tu reserva (Ley 1581 de 2012). ¿Me autorizas?"], () =>
        quick([["Sí, autorizo", flow.register], ["Ver política", () => { showPrivacy(); quick(chat.lastQuick); }], ["No autorizo", flow.noConsent]]));
    },
    register() {
      const v = RR.get.vehicle(chat.ctx.vid);
      const c = RR.upsertCustomer({ nombre: chat.ctx.nombre, doc: "CC " + chat.ctx.doc, tel: chat.conv.tel, email: "", origen: "whatsapp", consent: { datos: new Date().toISOString() } });
      c.verif = c.verif || {}; ["identidad", "licencia", "edad", "deposito"].forEach((k) => (c.verif[k] = c.verif[k] === "verificado" ? "verificado" : "pendiente")); c.verif.contacto = "verificado";
      const res = RR.createReservation({ cliente: c.id, vehiculo: v.id, inicio: chat.ctx.start, fin: chat.ctx.end, lugar: chat.ctx.loc, origen: "whatsapp", notas: `Propósito: ${chat.ctx.purpose || "—"} · ${chat.ctx.pax || "?"} personas` }, "Asistente IA");
      if (!res.ok) { bot(["Ups, alguien acaba de apartar ese vehículo 😕 Te muestro otras opciones."], () => flow.dates(chat.ctx.start, chat.ctx.end)); return; }
      chat.conv.cliente = c.id; chat.conv.nombre = c.nombre; chat.conv.reserva = res.reservation.id; RR.store.save();
      chat.step = "done";
      bot([`¡Listo, ${firstName()}! ✅ Tu solicitud *${res.reservation.codigo}* quedó registrada y te aparté el ${v.marca} ${v.modelo} por ${st.prereservaHoras} horas.`], () => {
        sys(`Solicitud ${res.reservation.codigo} creada · Pre-reserva vence ${RR.fmtDT(res.reservation.expira)}`);
        bot(["Ahora sube tu cédula y licencia en este enlace seguro 👉 *[Subir documentos]* (en la demo es simulado).", "Un asesor revisará todo y te confirmará por aquí. ¿Te ayudo con algo más?"], () =>
          quick([["¿Cómo funciona el depósito?", () => answer("deposito")], ["Horarios de entrega", () => answer("horario")], ["No, gracias 👍", () => bot([`¡Con gusto, ${firstName()}! Que tengas un excelente día 🚗`])]]));
      });
    },
    noConsent() { chat.step = "free"; bot(["Entiendo, sin problema. Sin tu autorización no puedo registrar tus datos, pero un asesor puede ayudarte por otro medio."], () => quick([["Hablar con un asesor", flow.human], ["Volver a empezar", flow.start]])); },
    human() {
      chat.step = "human";
      ensureConv(); chat.conv.estado = "pendiente"; chat.conv.noLeidos = 1; RR.store.save();
      bot(["Te comunico con un asesor 🙌 Normalmente responde en menos de 15 minutos en horario de atención (" + RR.BUSINESS.hours + ")."], () => sys("Conversación transferida a un asesor · Visible en el panel → Conversaciones"));
    },
  };

  const ANSWERS = {
    requisitos: () => `Para alquilar necesitas:\n• Tener ${st.edadMinima} años o más\n• Cédula o pasaporte\n• Licencia vigente (${st.categorias.join(", ")})\n• Depósito de garantía reembolsable`,
    precio: () => `Nuestras tarifas van desde *${RR.money(Math.min(...S.vehicles.map((v) => v.precio)))}/día* (Kia Picanto) hasta *${RR.money(Math.max(...S.vehicles.map((v) => v.precio)))}/día* (van de 12 puestos). Incluyen seguro todo riesgo.`,
    deposito: () => "El depósito es reembolsable 💳 Se bloquea al entregar el vehículo y se libera al devolverlo en buen estado. El monto depende del vehículo.",
    horario: () => `Entregamos y recibimos vehículos ${RR.BUSINESS.hours}. Fuera de ese horario, consúltanos y lo coordinamos.`,
    km: () => "Kilometraje libre dentro de Antioquia 🛣️ Si vas a salir del departamento, cuéntanos para dejarlo registrado.",
    seguro: () => "Todos los vehículos tienen SOAT y seguro todo riesgo, con deducible según la póliza.",
    mascota: () => "¡Sí aceptamos mascotas! 🐶 Solo te pedimos usar guacal o cobertor para la silla.",
    cancelar: () => "Puedes cancelar sin costo hasta 48 horas antes de la recogida.",
  };
  function answer(key) {
    bot([ANSWERS[key]()], () => { if (chat.lastQuick && !["name", "doc"].includes(chat.step)) quick(chat.lastQuick); });
  }

  function handleText(t) {
    const s = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (chat.step === "name") {
      if (t.trim().split(/\s+/).length < 2) { bot(["¿Me escribes tu nombre y apellido, por favor? 😊"]); return; }
      chat.ctx.nombre = t.trim().split(/\s+/).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" "); flow.askDoc(); return;
    }
    if (chat.step === "doc") {
      const digits = t.replace(/\D/g, "");
      if (digits.length < 6 || digits.length > 11) { bot(["Mmm, ese número no parece una cédula válida. ¿Lo revisas? (solo números)"]); return; }
      chat.ctx.doc = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."); flow.askConsent(); return;
    }
    if (/asesor|humano|persona|alguien|llamar|queja|reclamo/.test(s)) return flow.human();
    if (/requisit|documento|licencia|necesito para/.test(s)) return answer("requisitos");
    if (/precio|cuanto|tarifa|valor|cuesta|cotiz/.test(s)) return answer("precio");
    if (/deposito|garantia/.test(s)) return answer("deposito");
    if (/horario|hora|abren|cierran/.test(s)) return answer("horario");
    if (/kilometr|km|fuera de antioquia|viajar a/.test(s)) return answer("km");
    if (/seguro|accidente|choque/.test(s)) return answer("seguro");
    if (/mascota|perro|gato/.test(s)) return answer("mascota");
    if (/cancel/.test(s)) return answer("cancelar");
    if (/descuento|rebaja|negoci/.test(s)) return bot(["Los descuentos por alquileres largos los aprueba el propietario directamente. ¿Te comunico con un asesor?"], () => quick([["Sí, por favor", flow.human], ["No, sigamos", () => chat.lastQuick && quick(chat.lastQuick)]]));
    if (/^(hola|buenas|buenos|hey|ola)/.test(s)) return chat.step === "start" ? flow.start() : bot(["¡Hola de nuevo! 😊 ¿En qué te ayudo?"], () => chat.lastQuick && quick(chat.lastQuick));
    if (/gracias|listo|ok|perfecto/.test(s)) return bot(["¡Con gusto! 🙌 Si necesitas algo más, aquí estoy."]);
    bot(["No estoy seguro de haber entendido 🤔 Puedo ayudarte con precios, disponibilidad, requisitos o reservas. ¿O prefieres hablar con un asesor?"], () => quick([["Ver vehículos disponibles", () => flow.pax(chat.ctx.pax || 4)], ["Hablar con un asesor", flow.human]]));
  }

  /* ---------- Inicio ---------- */
  renderChips();
  renderGrid();
})();
