/* RodaRent — sitio público conectado a la API (catálogo, reservas y asistente de IA) */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const I = RR.icon;
  let S = null; // { vehicles, reservations (solo periodos ocupados), settings }
  let st = null;
  let iaDisponible = false;
  let verifikDisponible = false;

  /* ---------- Iconos estáticos ---------- */
  $("#logoMark").innerHTML = I.car;
  ["#waIc1", "#waIc2", "#waIc3"].forEach((id) => ($(id).innerHTML = I.wa.replace("<svg", '<svg width="18" height="18"')));
  $("#fabIc").innerHTML = I.wa;
  $("#fIc1").innerHTML = I.check;
  $("#fIc2").innerHTML = I.chat;
  $("#heroCar").innerHTML = RR.carSVG("suv", "#2546d8");
  $("#trust").innerHTML = [["shield", "Seguro todo riesgo"], ["check", "Kilometraje libre en Antioquia"], ["clock", "Atención inmediata"]].map(([i, t]) => `<span>${I[i]}${t}</span>`).join("");

  async function cargarCatalogo() {
    const d = await RR.api("/api/catalogo");
    S = { vehicles: d.vehicles, reservations: d.busy, settings: d.settings };
    RR.store.state = S;
    st = d.settings;
    iaDisponible = d.iaDisponible;
    verifikDisponible = !!d.verifikDisponible;
    RR.setBusiness(d.negocio, d.settings);
    document.querySelectorAll("[data-negocio]").forEach((el) => (el.textContent = d.negocio.nombre));
  }

  /* ---------- Búsqueda ---------- */
  const search = { loc: "", start: null, end: null, type: "all" };
  const t0 = RR.addDays(RR.startOfDay(new Date()), 1); t0.setHours(9);
  const t1 = RR.addDays(t0, 3);
  search.start = t0.toISOString(); search.end = t1.toISOString();
  $("#sStart").value = RR.toLocalInput(t0);
  $("#sEnd").value = RR.toLocalInput(t1);
  $("#sStart").min = RR.toLocalInput(new Date());

  $("#searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = new Date($("#sStart").value), b = new Date($("#sEnd").value);
    if (!(b > a)) { $("#sEnd").classList.add("invalid"); RR.toast("La devolución debe ser posterior a la recogida", true); return; }
    $("#sEnd").classList.remove("invalid");
    Object.assign(search, { loc: $("#sLoc").value, start: a.toISOString(), end: b.toISOString() });
    try { await cargarCatalogo(); } catch (err) { RR.toast(err.message, true); }
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
    const list = S.vehicles.filter((v) => search.type === "all" || v.tipo === search.type);
    const avail = list.filter((v) => RR.isAvailable(v, search.start, search.end));
    $("#availNote").innerHTML = `${I.cal}<span><b>${avail.length} de ${list.length}</b> disponibles del <b>${RR.fmtDT(search.start)}</b> al <b>${RR.fmtDT(search.end)}</b> (${dias} ${dias === 1 ? "día" : "días"})</span>`;
    list.sort((a, b) => RR.isAvailable(b, search.start, search.end) - RR.isAvailable(a, search.start, search.end) || a.precio - b.precio);
    $("#grid").innerHTML = list.map((v) => {
      const ok = RR.isAvailable(v, search.start, search.end);
      const why = v.estado === "mantenimiento" ? "En mantenimiento" : "No disponible en esas fechas";
      return `<article class="card car ${ok ? "" : "unavailable"}">
        <div class="car-art">${ok ? '<span class="badge b-ok">Disponible</span>' : `<span class="badge b-neutral">${why}</span>`}${v.destacado && ok ? `<span class="tag-hot">${RR.esc(v.destacado)}</span>` : ""}${RR.carSVG(v.tipo, v.color)}</div>
        <div class="body">
          <div><div class="name">${RR.esc(v.marca)} ${RR.esc(v.modelo)}</div><div class="small subtle">${RR.TYPE_LABEL[v.tipo]} · ${v.anio}</div></div>
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
  function renderInfo() {
    $("#sLoc").innerHTML = RR.BUSINESS.locations.map((l) => `<option>${RR.esc(l)}</option>`).join("");
    search.loc = RR.BUSINESS.locations[0];
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
      ["¿Me lo pueden llevar a domicilio o al aeropuerto?", "Sí. Entregamos en el aeropuerto, la terminal o a domicilio con un costo adicional."],
      ["¿Puede manejar otra persona?", "Sí, registrándola como conductor adicional. Debe cumplir los mismos requisitos."],
      ["¿Puedo viajar con mascotas?", "Sí, con guacal o cobertor de silla. Se cobra limpieza si el vehículo se devuelve sucio."],
      ["¿Cómo protegen mis datos?", "Solo pedimos lo necesario para el alquiler, con tu autorización y conforme a la Ley 1581 de 2012. Puedes pedir que actualicemos o eliminemos tus datos."],
    ];
    $("#faqList").innerHTML = FAQ.map(([q, a], i) => `<details class="faq" ${i === 0 ? "open" : ""}><summary>${q}</summary><p>${a}</p></details>`).join("");
  }

  function showPrivacy() {
    RR.openModal(`<div class="modal-head"><h2>Autorización de tratamiento de datos</h2><button class="btn btn-ghost btn-icon" data-close>${I.x}</button></div>
      <div class="modal-body stack small muted">
        <p><b>Texto base:</b> debe revisarlo un abogado antes de publicarse.</p>
        <p>Autorizo a ${RR.esc(RR.BUSINESS.name)} a tratar mis datos personales (nombre, documento, contacto, licencia y documentos aportados) con la finalidad exclusiva de gestionar mi solicitud de alquiler, verificar requisitos, celebrar y ejecutar el contrato y enviarme comunicaciones sobre mi reserva.</p>
        <p>Los documentos se almacenan con acceso restringido y se eliminan ${st.retencionDias} días después de finalizado el servicio, salvo obligación legal. Puedo conocer, actualizar, rectificar y suprimir mis datos escribiendo al canal de atención.</p>
        <p>Cualquier consulta de antecedentes se hará solo con autorización expresa adicional, finalidad legítima y a través de mecanismos legalmente permitidos.</p>
        <p>Las comunicaciones comerciales solo se envían si las autorizo por separado.</p>
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
            <div class="sum"><div class="art">${RR.carSVG(v.tipo, v.color)}</div><div><div class="bold">${RR.esc(v.marca)} ${RR.esc(v.modelo)} · ${v.anio}</div>${specs(v)}</div></div>
            <div class="form-grid">
              <div class="field full"><label for="bLoc">Lugar de recogida</label><select class="select" id="bLoc">${RR.BUSINESS.locations.map((l) => `<option ${l === b.loc ? "selected" : ""}>${RR.esc(l)}</option>`).join("")}</select></div>
              <div class="field"><label for="bStart">Recogida</label><input class="input" type="datetime-local" id="bStart" value="${RR.toLocalInput(b.start)}"></div>
              <div class="field"><label for="bEnd">Devolución</label><input class="input" type="datetime-local" id="bEnd" value="${RR.toLocalInput(b.end)}"></div>
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
        b.modo = b.modo || "nuevo";
        const hab = b.modo === "habitual";
        // Para habituales solo se piden los datos que falten en su registro.
        const pedir = (k) => !hab || (b.habitual && b.habitual.faltan.includes(k));
        const campos = `
              ${!hab ? `<div class="field full"><label for="fName">Nombre completo</label><input class="input" id="fName" value="${RR.esc(d.nombre || "")}" autocomplete="name" placeholder="Como aparece en tu documento"></div>` : ""}
              <div class="field"><label for="fDoc">Número de documento</label><input class="input" id="fDoc" value="${RR.esc(d.docNum || "")}" inputmode="numeric" placeholder="Cédula o pasaporte" ${hab && b.habitual ? "disabled" : ""}></div>
              <div class="field"><label for="fTel">Celular (WhatsApp)</label><input class="input" id="fTel" value="${RR.esc(d.tel || "")}" inputmode="tel" autocomplete="tel" placeholder="300 123 4567" ${hab && b.habitual ? "disabled" : ""}></div>
              ${hab && !b.habitual ? `<div class="field full"><button type="button" class="btn" id="fBuscar">${I.search}Buscar mis datos</button><span class="help">Usamos documento + celular para proteger tus datos.</span></div>` : ""}
              ${hab && b.habitual ? `<div class="full callout ok">${I.check}<span>¡Hola de nuevo, <b>${RR.esc(b.habitual.primerNombre)}</b>! Ya tenemos tus datos${b.habitual.faltan.length ? "; solo completa lo que falta." : ". No tienes que escribirlos otra vez."} <a href="#" id="fOtro" style="color:inherit;font-weight:600">Usar otros datos</a></span></div>` : ""}
              ${(!hab || b.habitual) && pedir("nacimiento") ? `<div class="field"><label for="fBirth">Fecha de nacimiento</label><input class="input" type="date" id="fBirth" value="${d.birth || ""}"></div>` : ""}
              ${(!hab || b.habitual) && pedir("email") ? `<div class="field"><label for="fEmail">Correo electrónico</label><input class="input" type="email" id="fEmail" value="${RR.esc(d.email || "")}" autocomplete="email" placeholder="tucorreo@ejemplo.com"></div>` : ""}
              ${(!hab || b.habitual) && pedir("licencia") ? `<div class="field"><label for="fLic">Categoría de licencia</label><select class="select" id="fLic">${["B1", "B2", "C1", "A2", "Otra"].map((c) => `<option ${d.lic === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>` : ""}
              ${(!hab || b.habitual) && pedir("licenciaVence") ? `<div class="field"><label for="fLicV">${hab ? "Nuevo vencimiento de la licencia" : "Vencimiento de la licencia"}</label><input class="input" type="date" id="fLicV" value="${d.licV || ""}">${hab ? '<span class="help">La que tenemos registrada vence antes de tu alquiler.</span>' : ""}</div>` : ""}
              ${!hab || b.habitual ? `<div class="field full"><label for="fNotes">Comentarios (opcional)</label><textarea class="textarea" id="fNotes" placeholder="Ej.: necesito silla para bebé">${RR.esc(d.notas || "")}</textarea></div>
              ${hab ? "" : '<p class="help full">Después de enviar, un asesor te pedirá la foto de tu cédula y licencia por un canal seguro.</p>'}
              <label class="check full"><input type="checkbox" id="fConsent" ${d.consent ? "checked" : ""}><span>Autorizo el tratamiento de mis datos personales para gestionar esta solicitud, según la <a href="/privacidad" target="_blank" style="color:var(--brand);font-weight:600">política de privacidad</a>.</span></label>
              <label class="check full"><input type="checkbox" id="fMkt" ${d.mkt ? "checked" : ""}><span>Quiero recibir recordatorios y promociones por WhatsApp (opcional).</span></label>
              ${verifikDisponible ? `<label class="check full"><input type="checkbox" id="fVerif" ${d.verif ? "checked" : ""}><span><b>Agilizar mi reserva (opcional):</b> autorizo consultar mi licencia en el RUNT y mis antecedentes en la Policía y la Procuraduría con mi documento. Si no lo autorizas, un asesor revisa tus documentos.</span></label>` : ""}` : ""}`;
        root.innerHTML = head("Tus datos", "Paso 2 de 3 · Información del conductor principal") + `
          <form class="modal-body stack" id="bForm" novalidate>
            <div class="seg" style="width:100%"><button type="button" style="flex:1" data-modo="nuevo" class="${!hab ? "active" : ""}">Soy cliente nuevo</button><button type="button" style="flex:1" data-modo="habitual" class="${hab ? "active" : ""}">Ya he alquilado antes</button></div>
            <div class="form-grid">${campos}</div>
            <div id="fErr"></div>
          </form>
          <div class="modal-foot"><button class="btn" id="bBack">${I.back} Atrás</button><button class="btn btn-primary" id="bSend" ${hab && !b.habitual ? "disabled" : ""}>Enviar solicitud</button></div>`;
        const val = (id) => { const el = $(id, root); return el ? (el.type === "checkbox" ? el.checked : el.value.trim()) : undefined; };
        const collect = () => {
          const m = { nombre: val("#fName"), docNum: val("#fDoc"), birth: val("#fBirth"), tel: val("#fTel"), email: val("#fEmail"), lic: val("#fLic"), licV: val("#fLicV"), notas: val("#fNotes"), consent: val("#fConsent"), mkt: val("#fMkt"), verif: val("#fVerif") };
          Object.keys(m).forEach((k) => { if (m[k] !== undefined) d[k] = m[k]; });
        };
        $$("[data-modo]", root).forEach((btn) => btn.addEventListener("click", () => { collect(); b.modo = btn.dataset.modo; b.habitual = null; render(); }));
        const otro = $("#fOtro", root); if (otro) otro.addEventListener("click", (e) => { e.preventDefault(); b.habitual = null; render(); });
        const buscar = $("#fBuscar", root);
        if (buscar) buscar.addEventListener("click", async () => {
          collect();
          if (!/^[0-9A-Za-z.\-]{5,15}$/.test(d.docNum || "") || !/^\+?[0-9 ]{10,15}$/.test(d.tel || "")) { $("#fErr", root).innerHTML = `<div class="callout err">${I.alert}<span>Escribe tu documento y tu celular.</span></div>`; return; }
          buscar.disabled = true; buscar.textContent = "Buscando…";
          try {
            const r = await RR.api("/api/clientes/identificar", { documento: d.docNum, telefono: d.tel, fin: b.end });
            if (!r.encontrado) { buscar.disabled = false; buscar.innerHTML = `${I.search}Buscar mis datos`; $("#fErr", root).innerHTML = `<div class="callout warn">${I.alert}<span>No encontramos un cliente con ese documento y celular. Revisa los datos o elige <b>Soy cliente nuevo</b>.</span></div>`; return; }
            b.habitual = r; render();
          } catch (err) { buscar.disabled = false; buscar.innerHTML = `${I.search}Buscar mis datos`; $("#fErr", root).innerHTML = `<div class="callout err">${I.alert}<span>${RR.esc(err.message)}</span></div>`; }
        });
        $("#bBack", root).addEventListener("click", () => { collect(); b.step = 1; render(); });
        $("#bSend", root).addEventListener("click", async () => {
          collect();
          const d2 = b.data, errs = [];
          $$(".input", root).forEach((i) => i.classList.remove("invalid"));
          const bad = (id, msg) => { const el = $(id, root); if (el) el.classList.add("invalid"); errs.push(msg); };
          const hay = (id) => !!$(id, root);
          if (hay("#fName") && (d2.nombre || "").split(" ").filter(Boolean).length < 2) bad("#fName", "Escribe tu nombre y apellido.");
          if (!/^[0-9A-Za-z.\-]{5,15}$/.test(d2.docNum || "")) bad("#fDoc", "Documento inválido.");
          if (!/^\+?[0-9 ]{10,15}$/.test(d2.tel || "")) bad("#fTel", "Celular inválido (10 dígitos).");
          if (hay("#fEmail") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d2.email || "")) bad("#fEmail", "Correo inválido.");
          if (hay("#fBirth")) {
            if (!d2.birth) bad("#fBirth", "Indica tu fecha de nacimiento.");
            else if (Math.floor((Date.now() - new Date(d2.birth)) / (365.25 * 86400000)) < st.edadMinima) bad("#fBirth", `La edad mínima para alquilar es ${st.edadMinima} años.`);
          }
          if (hay("#fLicV")) {
            if (!d2.licV) bad("#fLicV", "Indica el vencimiento de tu licencia.");
            else if (new Date(d2.licV) < new Date(b.end)) bad("#fLicV", "Tu licencia debe estar vigente durante todo el alquiler.");
          }
          if (hay("#fLic") && !st.categorias.includes(d2.lic)) errs.push(`Para este vehículo se requiere licencia ${st.categorias.join(", ")}.`);
          if (!d2.consent) errs.push("Debes autorizar el tratamiento de datos para enviar la solicitud.");
          if (errs.length) { $("#fErr", root).innerHTML = `<div class="callout err">${I.alert}<div>${errs.map(RR.esc).join("<br>")}</div></div>`; return; }

          const btn = $("#bSend", root); btn.disabled = true; btn.textContent = "Enviando…";
          const opt = (id, v) => (hay(id) && v ? v : undefined);
          try {
            const r = await RR.api("/api/reservas", {
              habitual: hab, vehiculo: v.id, inicio: b.start, fin: b.end, lugar: b.loc, documento: d2.docNum, telefono: d2.tel,
              nombre: opt("#fName", d2.nombre), email: opt("#fEmail", d2.email), nacimiento: opt("#fBirth", d2.birth), licencia: opt("#fLic", d2.lic), licenciaVence: opt("#fLicV", d2.licV),
              notas: d2.notas || "", consentimiento: true, marketing: !!d2.mkt, verificar: !!d2.verif,
            });
            b.res = r; b.step = 3; render();
            cargarCatalogo().then(renderGrid).catch(() => {});
          } catch (err) {
            btn.disabled = false; btn.textContent = "Enviar solicitud";
            $("#fErr", root).innerHTML = `<div class="callout err">${I.alert}<span>${RR.esc(err.message)}</span></div>`;
          }
        });
      } else {
        const r = b.res;
        root.innerHTML = `<div class="modal-head"><span></span><button class="btn btn-ghost btn-icon" data-x>${I.x}</button></div>
          <div class="modal-body" style="text-align:center">
            <div class="success-ic">${I.check}</div>
            <h2 style="font-size:22px">¡Solicitud enviada${r.nombre ? ", " + RR.esc(r.nombre) : ""}!</h2>
            <p class="muted" style="margin-top:6px">Tu código es <b style="color:var(--text)">${RR.esc(r.codigo)}</b></p>
            <div class="card card-pad" style="text-align:left;margin-top:20px">
              <div class="row between"><span class="muted small">Vehículo</span><b class="small">${RR.esc(v.marca)} ${RR.esc(v.modelo)}</b></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Recogida</span><span class="small">${RR.fmtDT(r.inicio)}</span></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Devolución</span><span class="small">${RR.fmtDT(r.fin)}</span></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Total estimado</span><b class="small">${RR.money(r.total)}</b></div>
              <div class="row between" style="margin-top:8px"><span class="muted small">Estado</span>${RR.badge(RR.RES_STATUS, "pendiente")}</div>
            </div>
            <div class="callout warn" style="text-align:left;margin-top:14px">${I.clock}<span>Apartamos el vehículo hasta el <b>${RR.fmtDT(r.expira)}</b> mientras un asesor verifica tus documentos. Te confirmaremos por WhatsApp</span></div>
          </div>
          <div class="modal-foot"><button class="btn btn-primary" data-x>Listo</button></div>`;
      }
      $$("[data-x]", root).forEach((x) => x.addEventListener("click", m.close));
    }
    render();
  }

  /* ======================================================================
     ASISTENTE VIRTUAL (IA real vía /api/chat)
     ====================================================================== */
  const CONV_KEY = "rr_conversacion";
  const chat = { open: false, built: false, conv: null, ultimoId: 0, estado: "ia", enviando: false, poll: null };
  try { chat.conv = localStorage.getItem(CONV_KEY); } catch (e) { /* sin almacenamiento */ }
  const panel = $("#chatPanel");

  function openChat() {
    chat.open = true; panel.classList.remove("hidden"); $("#fabHint").classList.add("hidden"); $(".fab .ping").classList.add("hidden");
    if (!chat.built) { buildPanel(); chat.built = true; iniciar(); }
    iniciarSondeo();
    setTimeout(() => $("#waText") && $("#waText").focus(), 50);
  }
  function closeChat() { chat.open = false; panel.classList.add("hidden"); clearInterval(chat.poll); }
  $("#fab").addEventListener("click", () => (chat.open ? closeChat() : openChat()));
  $$("[data-open-chat]").forEach((b) => b.addEventListener("click", openChat));
  setTimeout(() => $("#fabHint") && $("#fabHint").classList.add("hidden"), 9000);

  function buildPanel() {
    panel.innerHTML = `<div class="wa">
      <div class="wa-head"><div class="wa-avatar">${I.car}</div><div><div class="wa-title">${RR.esc(RR.BUSINESS.name)}</div><div class="wa-sub" id="waStatus">en línea · asistente virtual</div></div><button class="x" id="waClose" aria-label="Cerrar">${I.x}</button></div>
      <div class="wa-body" id="waBody" aria-live="polite"></div>
      <form class="wa-input" id="waForm"><input id="waText" placeholder="Escribe un mensaje" autocomplete="off" maxlength="1500"><button class="wa-send" aria-label="Enviar">${I.send}</button></form>
      <div class="wa-note">Asistente con IA · un asesor humano revisa y confirma cada reserva</div>
    </div>`;
    $("#waClose").addEventListener("click", closeChat);
    $("#waForm").addEventListener("submit", (e) => { e.preventDefault(); const t = $("#waText").value.trim(); if (!t || chat.enviando) return; $("#waText").value = ""; enviar(t); });
  }

  const body = () => $("#waBody");
  const scroll = () => { const b = body(); b.scrollTop = b.scrollHeight; };
  const fmt = (t) => RR.esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<b>$1</b>");
  function burbuja(emisor, texto, fecha) {
    if (emisor === "sistema") { const el = document.createElement("div"); el.className = "msg sys"; el.textContent = texto; body().appendChild(el); scroll(); return; }
    const el = document.createElement("div");
    el.className = "msg " + (emisor === "cliente" ? "out" : "in");
    const label = emisor === "humano" ? '<span class="msg-label">Asesor</span>' : "";
    el.innerHTML = `${label}${fmt(texto)}<span class="time">${RR.fmtTime(fecha || new Date().toISOString())}${emisor === "cliente" ? " ✓✓" : ""}</span>`;
    body().appendChild(el); scroll();
  }
  function sugerencias() {
    const q = document.createElement("div"); q.className = "quick";
    [["Quiero cotizar un vehículo", "Quiero cotizar un vehículo"], ["Ver precios", "¿Cuáles son los precios?"], ["Ya soy cliente", "Ya he alquilado con ustedes antes y quiero reservar de nuevo"], ["Consultar mi reserva", "Quiero consultar mi reserva"], ["Requisitos", "¿Qué requisitos piden?"]]
      .forEach(([l, t]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.addEventListener("click", () => { q.remove(); enviar(t); }); q.appendChild(b); });
    body().appendChild(q); scroll();
  }

  async function iniciar() {
    if (chat.conv) {
      try {
        const d = await RR.api(`/api/chat/${chat.conv}?desde=0`);
        chat.estado = d.estado;
        d.mensajes.forEach((m) => { burbuja(m.emisor, m.texto, m.fecha); chat.ultimoId = m.id; });
        if (d.mensajes.length) return;
      } catch (e) { chat.conv = null; try { localStorage.removeItem(CONV_KEY); } catch (_) {} }
    }
    burbuja("ia", `¡Hola! 👋 Soy el asistente virtual de ${RR.BUSINESS.name}. Te ayudo a cotizar, revisar disponibilidad y reservar. ¿En qué te ayudo?`);
    if (!iaDisponible) burbuja("sistema", "El asistente automático no está activo en este momento. Escríbenos y un asesor te responderá, o usa el formulario de reserva.");
    sugerencias();
  }

  async function enviar(texto) {
    $$(".quick", body()).forEach((q) => q.remove());
    burbuja("cliente", texto);
    chat.enviando = true;
    const typing = document.createElement("div"); typing.className = "typing"; typing.innerHTML = "<i></i><i></i><i></i>";
    if (chat.estado === "ia") { body().appendChild(typing); scroll(); $("#waStatus").textContent = "escribiendo…"; }
    try {
      const d = await RR.api("/api/chat", { conversacion: chat.conv || undefined, mensaje: texto });
      chat.conv = d.conversacion; chat.estado = d.estado;
      try { localStorage.setItem(CONV_KEY, d.conversacion); } catch (e) { /* sin almacenamiento */ }
      typing.remove();
      // Trae lo nuevo (respuesta de la IA y avisos del sistema) en orden.
      const n = await RR.api(`/api/chat/${chat.conv}?desde=${chat.ultimoId}`);
      n.mensajes.forEach((m) => { if (m.emisor !== "cliente") burbuja(m.emisor, m.texto, m.fecha); chat.ultimoId = m.id; });
      if (chat.estado !== "ia" && !n.mensajes.some((m) => m.emisor !== "cliente")) burbuja("sistema", "Un asesor te responderá por aquí en breve.");
    } catch (err) {
      typing.remove();
      burbuja("sistema", err.message);
    } finally {
      chat.enviando = false;
      $("#waStatus").textContent = chat.estado === "ia" ? "en línea · asistente virtual" : "en línea · te atiende un asesor";
    }
  }

  // Revisa cada 6 s si un asesor respondió.
  function iniciarSondeo() {
    clearInterval(chat.poll);
    chat.poll = setInterval(async () => {
      if (!chat.conv || chat.enviando || document.hidden) return;
      try {
        const n = await RR.api(`/api/chat/${chat.conv}?desde=${chat.ultimoId}`);
        chat.estado = n.estado;
        n.mensajes.forEach((m) => { if (m.emisor !== "cliente") burbuja(m.emisor, m.texto, m.fecha); chat.ultimoId = m.id; });
        $("#waStatus").textContent = chat.estado === "ia" ? "en línea · asistente virtual" : "en línea · te atiende un asesor";
      } catch (e) { /* reintenta en el siguiente ciclo */ }
    }, 6000);
  }

  /* ---------- Inicio ---------- */
  (async function () {
    try {
      await cargarCatalogo();
      renderInfo(); renderChips(); renderGrid();
    } catch (e) {
      $("#grid").innerHTML = `<div class="empty">No pudimos cargar el catálogo. Revisa tu conexión y recarga la página.</div>`;
    }
  })();
})();
