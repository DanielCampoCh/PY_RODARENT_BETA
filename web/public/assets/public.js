/* RodaRent — sitio público conectado a la API (catálogo, reservas y asistente de IA) */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const I = RR.icon;
  let S = null; // { vehicles, reservations (solo periodos ocupados), settings }
  let st = null;
  let iaDisponible = false;
  let galeria = null;

  /* ---------- Iconos estáticos ---------- */
  $("#logoMark").innerHTML = RR.marca;
  $("#igIc").innerHTML = I.camara;
  ["#waIc1", "#waIc2", "#waIc3"].forEach((id) => ($(id).innerHTML = I.wa.replace("<svg", '<svg width="18" height="18"')));
  $("#fabIc").innerHTML = I.wa;
  $("#fIc1").innerHTML = I.check;
  $("#fIc2").innerHTML = I.chat;
  $("#heroCar").innerHTML = RR.carSVG("suv", "#24211b");
  $("#trust").innerHTML = [["shield", "Vehículos asegurados"], ["pin", "Entrega a domicilio"], ["clock", "Servicio 24/7"]].map(([i, t]) => `<span>${I[i]}${t}</span>`).join("");
  [["#dIc1", "pin", "Recogida donde estés, en Cali y alrededores"], ["#dIc2", "users", "Conductores del equipo, con experiencia"], ["#dIc3", "chat", "Te avisamos por el chat quién te recoge"]].forEach(([id, i, t]) => ($(id).innerHTML = `${I[i]}${t}`));

  async function cargarCatalogo() {
    const d = await RR.api("/api/catalogo");
    S = { vehicles: d.vehicles, reservations: d.busy, settings: d.settings };
    RR.store.state = S;
    st = d.settings;
    iaDisponible = d.iaDisponible;
    galeria = d.galeria;
    RR.setBusiness(d.negocio, d.settings);
    document.querySelectorAll("[data-negocio]").forEach((el) => (el.textContent = d.negocio.nombre));
    if (d.negocio.lema) document.querySelectorAll("[data-lema]").forEach((el) => (el.textContent = d.negocio.lema));
    document.title = `${d.negocio.nombre} · ${d.negocio.ciudad}`;
  }

  /* ---------- Búsqueda ---------- */
  const search = { loc: "", ubic: null, start: null, end: null, type: "all" };
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
    Object.assign(search, { start: a.toISOString(), end: b.toISOString() });
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
    const todos = S.vehicles.filter((v) => search.type === "all" || v.tipo === search.type);
    const avail = todos.filter((v) => RR.isAvailable(v, search.start, search.end));
    $("#availNote").innerHTML = `${I.cal}<span><b>${avail.length} de ${todos.length}</b> disponibles del <b>${RR.fmtDT(search.start)}</b> al <b>${RR.fmtDT(search.end)}</b> (${dias} ${dias === 1 ? "día" : "días"})</span>`;
    const orden = (a, b) => RR.isAvailable(b, search.start, search.end) - RR.isAvailable(a, search.start, search.end) || a.precio - b.precio;
    // Catálogo propio y, aparte, el de la agencia aliada.
    const propios = todos.filter((v) => v.modalidad !== "agencia").sort(orden);
    const agencia = todos.filter((v) => v.modalidad === "agencia").sort(orden);
    $("#grid").innerHTML = tarjetas(propios, dias) || (S.vehicles.length
      ? `<div class="empty">No hay vehículos de este tipo.</div>`
      : `<div class="empty">Estamos actualizando el catálogo en línea. Mira las fotos de nuestros carros aquí abajo y cotiza por el chat: te respondemos al instante. <a href="#galeria" style="color:var(--brand);font-weight:700">Ver fotos</a></div>`);
    $("#agBlock").classList.toggle("hidden", !agencia.length);
    $("#gridAg").innerHTML = tarjetas(agencia, dias);
    $$("[data-book]").forEach((b) => b.addEventListener("click", () => openBooking(b.dataset.book)));
    $$("[data-fotos]").forEach((b) => b.addEventListener("click", () => { const v = RR.get.vehicle(b.dataset.fotos); RR.verFotos(v.fotos, `${v.marca} ${v.modelo} · ${RR.money(v.precio)} / día`); }));
  }
  /* ---------- Galería: fotos del Instagram del negocio ---------- */
  function renderGaleria(g) {
    const box = $("#galeria");
    if (!g || !g.fotos.length) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    $("#igLink").href = g.perfil;
    $("#igGrid").innerHTML = g.fotos.map((f, i) => `<figure class="ig-item">
        <button class="ig-foto" data-ig="${i}" aria-label="Ver foto: ${RR.esc(f.titulo)}"><img src="${RR.esc(f.url)}" alt="${RR.esc(f.titulo)} · ${RR.esc(f.detalle)}" loading="lazy"></button>
        <figcaption><b>${RR.esc(f.titulo)}</b><span>${RR.esc(f.detalle)}</span></figcaption>
        <button class="btn btn-sm" data-cotizar="${RR.esc(f.titulo)}">${I.chat}Cotizar</button>
      </figure>`).join("");
    $$("[data-ig]").forEach((b) => b.addEventListener("click", () => RR.verFotos(g.fotos.map((f) => f.url), "Nuestros vehículos", +b.dataset.ig)));
    $$("[data-cotizar]").forEach((b) => b.addEventListener("click", async () => { openChat(); await chat.listo; if (!chat.enviando) enviar(`Quiero cotizar el ${b.dataset.cotizar}`); }));
  }
  function tarjetas(list, dias) {
    return list.map((v) => {
      const ok = RR.isAvailable(v, search.start, search.end);
      const why = v.estado === "mantenimiento" ? "En mantenimiento" : "No disponible en esas fechas";
      return `<article class="card car ${ok ? "" : "unavailable"}">
        <div class="car-art ${v.fotos.length ? "con-foto" : ""}">${ok ? '<span class="badge b-ok">Disponible</span>' : `<span class="badge b-neutral">${why}</span>`}${v.destacado && ok ? `<span class="tag-hot">${RR.esc(v.destacado)}</span>` : ""}${v.fotos.length
          ? `<img class="car-foto" src="${RR.esc(v.fotos[0])}" alt="${RR.esc(v.marca)} ${RR.esc(v.modelo)}" loading="lazy"><button class="ver-fotos" data-fotos="${v.id}" aria-label="Ver fotos del ${RR.esc(v.marca)} ${RR.esc(v.modelo)}"></button>${v.fotos.length > 1 ? `<span class="n-fotos">${v.fotos.length} fotos</span>` : ""}`
          : RR.carSVG(v.tipo, v.color)}</div>
        <div class="body">
          <div><div class="name">${RR.esc(v.marca)} ${RR.esc(v.modelo)}</div><div class="small subtle">${RR.TYPE_LABEL[v.tipo]} · ${v.anio}</div></div>
          ${specs(v)}
          <div class="foot">
            <div><div class="price">${RR.money(v.precio)} <small>/ día</small></div><div class="xs muted">Total ${dias} d: <b>${RR.money(v.precio * dias)}</b></div></div>
            <button class="btn ${ok ? "btn-primary" : ""} btn-sm" data-book="${v.id}" ${ok ? "" : "disabled"}>${ok ? "Reservar" : "Ocupado"}</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  /* ---------- Requisitos, condiciones y FAQ ---------- */
  function renderInfo() {
    search.loc = RR.BUSINESS.locations[0];
    conectarLugar($("#sLoc"), $("#sLocNota"), search);
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
      ["pin", "Cobertura", "Kilometraje libre dentro del Valle del Cauca. Desde 15 días puedes viajar a cualquier ciudad; en alquileres más cortos, los viajes largos se acuerdan antes con un asesor."],
      ["shield", "Seguro", "SOAT y seguro todo riesgo incluidos, con deducible según póliza."],
      ["x", "Cancelación", "Sin costo hasta 48 horas antes de la recogida."],
    ].map(([i, t, d]) => `<li><span class="ic">${I[i]}</span><div><b>${t}</b><div class="muted">${d}</div></div></li>`).join("");
    const FAQ = [
      ["¿Cuánto tiempo apartan el vehículo?", `Cuando envías tu solicitud, el vehículo queda pre-reservado por ${st.prereservaHoras} horas mientras verificamos tus documentos. Si no se completa en ese plazo, se libera automáticamente.`],
      ["¿Cuándo me devuelven el depósito?", "Se reembolsa al devolver el vehículo, una vez revisado su estado. Si fue con tarjeta, el banco puede tardar de 3 a 8 días hábiles."],
      ["¿Me lo pueden llevar a domicilio o al aeropuerto?", "Sí. Te lo llevamos al aeropuerto Alfonso Bonilla Aragón, a la terminal o a tu casa en Cali."],
      ["¿Tienen servicio con conductor?", "Sí. Escríbele al asistente a dónde vas, desde dónde y a qué hora. Tu pedido les llega a nuestros conductores por WhatsApp y te avisamos por el chat quién te recoge."],
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
        <p>Las comunicaciones comerciales solo se envían si las autorizo por separado.</p>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-close>Entendido</button></div>`);
  }

  /* ---------- Ubicación: mapa con pin arrastrable + dirección editable a mano ---------- */
  const CALI = [3.4516, -76.532];
  const lugarDomicilio = () => RR.BUSINESS.locations.find((l) => /domicilio/i.test(l)) || null;
  let leaflet = null;
  function cargarLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leaflet) return leaflet;
    leaflet = new Promise((ok, mal) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => ok(window.L); s.onerror = () => { leaflet = null; mal(new Error("No se pudo cargar el mapa")); };
      document.head.appendChild(s);
    });
    return leaflet;
  }
  const corta = (d) => String(d || "").split(",").slice(0, 2).join(",").trim();

  /** Abre el mapa. Devuelve {direccion, indicaciones, lat, lng} o null si cancela. */
  function elegirUbicacion({ titulo = "Tu ubicación", boton = "Usar esta ubicación", previa = null } = {}) {
    return new Promise((resolver) => {
      let hecho = false;
      const fin = (v) => { if (hecho) return; hecho = true; resolver(v); };
      const m = RR.openModal(`<div class="modal-head"><div class="grow"><h2>${RR.esc(titulo)}</h2><p class="small muted" style="margin-top:4px">Si el punto no quedó bien, arrastra el pin o toca el mapa. También puedes escribir la dirección.</p></div><button class="btn btn-ghost btn-icon" data-close aria-label="Cerrar">${I.x}</button></div>
        <div class="modal-body stack">
          <button type="button" class="btn" id="uGps">${I.pin}Usar mi ubicación actual</button>
          <div class="callout warn hidden" id="uAviso"></div>
          <div class="ubic-mapa" id="uMapa"><span class="muted small">Cargando mapa…</span></div>
          <div class="field"><label for="uDir">Dirección</label>
            <div class="row" style="gap:8px"><input class="input grow" id="uDir" maxlength="300" placeholder="Ej.: Calle 5 # 38-20, San Fernando" value="${RR.esc((previa && previa.direccion) || "")}"><button type="button" class="btn" id="uBuscar">${I.search}Buscar</button></div>
            <span class="help" id="uEstado">Puedes corregirla a mano: el conductor usará lo que quede escrito aquí.</span></div>
          <div class="field"><label for="uInd">Indicaciones (opcional)</label><input class="input" id="uInd" maxlength="200" placeholder="Ej.: conjunto Los Pinos, torre 3, apto 502" value="${RR.esc((previa && previa.indicaciones) || "")}"></div>
        </div>
        <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="uOk">${RR.esc(boton)}</button></div>`, { onClose: () => fin(null) });
      const $m = (s) => m.el.querySelector(s);
      m.el.querySelector(".modal").style.maxWidth = "560px";
      const estado = (t, err) => { const e = $m("#uEstado"); e.textContent = t; e.style.color = err ? "var(--danger)" : ""; };
      let punto = previa && previa.lat != null ? { lat: previa.lat, lng: previa.lng } : null;
      let mapa = null, pin = null, editadaAMano = !!(previa && previa.direccion), pedido = 0, avisadoNumero = false;

      async function leerDireccion() {
        if (!punto) return;
        const n = ++pedido;
        estado("Buscando la dirección…");
        try {
          const q = `/api/ubicacion?lat=${punto.lat.toFixed(6)}&lng=${punto.lng.toFixed(6)}`;
          const r = await RR.api(q);
          if (n !== pedido) return;
          const dir = $m("#uDir");
          if (editadaAMano && dir.value.trim()) { estado("Revisa la dirección: si no es exacta, corrígela a mano."); return; }
          dir.value = r.direccion;
          if (r.numero || !r.via) { estado("Revisa la dirección: si no es exacta, corrígela a mano."); return; }
          // Sin número de casa: se estima aparte (puede tardar) y mientras tanto se puede escribir.
          estado(`Buscando el número de la casa sobre la ${r.via}…`);
          const r2 = await RR.api(q + "&numero=1").catch(() => null);
          if (n !== pedido) return;
          if (r2 && r2.numero && dir.value === r.direccion) {
            dir.value = r2.direccion;
            estado(`Número aproximado (${r2.numero}): confírmalo con la fachada o corrígelo.`);
          } else if (dir.value === r.direccion) {
            faltaNumero(r.via);
          }
        } catch (e) { if (n === pedido) estado(e.message + " Escríbela a mano.", true); }
      }
      /** Deja el cursor justo después de la vía para que el cliente escriba «# 3-45». */
      function faltaNumero(via) {
        const dir = $m("#uDir"), i = dir.value.indexOf(via);
        estado(`Falta el número de la casa: escríbelo después de «${via}» (ej.: # 3-45).`, true);
        if (i >= 0) { dir.focus(); const fin = i + via.length; dir.setSelectionRange(fin, fin); }
      }
      let circulo = null;
      function quitarAviso() {
        if (circulo) { circulo.remove(); circulo = null; }
        const a = $m("#uAviso"); if (a) a.classList.add("hidden");
      }
      function avisoAproximada(lat, lng, accuracy) {
        const m = Math.round(accuracy), km = m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
        const a = $m("#uAviso");
        a.innerHTML = `${I.alert}<span><b>Ubicación aproximada (±${km}).</b> ${/Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Activa el GPS o la ubicación precisa del celular, o" : "Los computadores no tienen GPS:"} arrastra el pin hasta tu casa (o toca el mapa en el lugar exacto) y revisa la dirección.</span>`;
        a.classList.remove("hidden");
        if (mapa && window.L) {
          circulo = window.L.circle([lat, lng], { radius: Math.min(accuracy, 5000), color: "#e3ab12", weight: 2, fillOpacity: 0.12 }).addTo(mapa);
          mapa.fitBounds(circulo.getBounds(), { maxZoom: 17, padding: [10, 10] });
        }
      }
      function ponerPunto(lat, lng, { leer = true, centrar = true, manual = false } = {}) {
        if (manual) quitarAviso();
        punto = { lat, lng };
        if (mapa) { pin.setLatLng([lat, lng]); pin.setOpacity(1); if (centrar) mapa.setView([lat, lng], Math.max(mapa.getZoom(), 16)); }
        if (leer) { editadaAMano = false; leerDireccion(); }
      }
      cargarLeaflet().then((L) => {
        if (hecho) return;
        const box = $m("#uMapa"); box.innerHTML = "";
        mapa = L.map(box, { zoomControl: true }).setView(punto ? [punto.lat, punto.lng] : CALI, punto ? 16 : 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
        const icono = L.divIcon({ className: "ubic-pin", html: I.pin, iconSize: [36, 36], iconAnchor: [18, 34] });
        pin = L.marker(punto ? [punto.lat, punto.lng] : CALI, { draggable: true, icon: icono, opacity: punto ? 1 : 0.55 }).addTo(mapa);
        pin.on("dragend", () => { const p = pin.getLatLng(); ponerPunto(p.lat, p.lng, { centrar: false, manual: true }); });
        mapa.on("click", (e) => ponerPunto(e.latlng.lat, e.latlng.lng, { centrar: false, manual: true }));
        setTimeout(() => mapa.invalidateSize(), 60);
      }).catch((e) => { $m("#uMapa").innerHTML = `<span class="muted small">${RR.esc(e.message)}. Escribe la dirección abajo.</span>`; });

      $m("#uGps").addEventListener("click", () => {
        if (!navigator.geolocation) { estado("Tu navegador no comparte la ubicación. Mueve el pin o escribe la dirección.", true); return; }
        const b = $m("#uGps"); b.disabled = true; estado("Pidiendo tu ubicación al navegador…");
        navigator.geolocation.getCurrentPosition((p) => {
          b.disabled = false;
          const { latitude: lat, longitude: lng, accuracy } = p.coords;
          ponerPunto(lat, lng, { centrar: accuracy <= 60 });
          // Computadores (sin GPS) dan la ubicación por wifi o IP: puede fallar por cientos de metros.
          // Se dibuja el margen de error y se pide mover el pin hasta la casa.
          if (accuracy > 60) avisoAproximada(lat, lng, accuracy);
        }, (err) => {
          b.disabled = false;
          estado(err.code === 1 ? "No diste permiso para ver tu ubicación. Mueve el pin en el mapa o escribe la dirección." : "No pudimos obtener tu ubicación. Mueve el pin o escribe la dirección.", true);
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
      });
      $m("#uDir").addEventListener("input", () => (editadaAMano = true));
      const buscar = async () => {
        const q = $m("#uDir").value.trim();
        if (q.length < 3) { estado("Escribe la dirección para buscarla.", true); return; }
        estado("Buscando en el mapa…");
        try {
          const r = await RR.api(`/api/ubicacion?q=${encodeURIComponent(q)}`);
          ponerPunto(r.lat, r.lng, { leer: false });
          estado("Ubicamos el punto. Si no es exacto, arrastra el pin (lo que escribiste se mantiene).");
        } catch (e) { estado(e.message, true); }
      };
      $m("#uBuscar").addEventListener("click", buscar);
      $m("#uDir").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } });
      $m("#uOk").addEventListener("click", () => {
        const direccion = $m("#uDir").value.trim();
        if (direccion.length < 3) { estado("Escribe la dirección o elige un punto en el mapa.", true); $m("#uDir").focus(); return; }
        // Una dirección de Cali sin número («Carrera 24, San Cristóbal») se avisa una vez; si insiste, se envía así.
        if (/\b(calle|carrera|cra|cl|kr|avenida|av|diagonal|transversal)\b/i.test(direccion) && !/#|\bno\.?\s*\d|\d+\s*-\s*\d+/i.test(direccion) && !avisadoNumero) {
          avisadoNumero = true; estado("Falta el número de la casa (ej.: Carrera 24 # 3-45). Escríbelo, o toca otra vez el botón para enviarla así.", true); $m("#uDir").focus(); return;
        }
        fin({ direccion, indicaciones: $m("#uInd").value.trim(), lat: punto ? +punto.lat.toFixed(6) : null, lng: punto ? +punto.lng.toFixed(6) : null });
        m.close();
      });
    });
  }
  /** Mismo formato que lib/geo.ts textoUbicacion: así el asistente lo lee igual en la web y en WhatsApp. */
  const textoUbicacion = (u) => [`📍 Mi ubicación: ${u.direccion}`, u.indicaciones ? `Indicaciones: ${u.indicaciones}` : "", u.lat != null ? `Mapa: https://maps.google.com/?q=${u.lat.toFixed(6)},${u.lng.toFixed(6)}` : ""].filter(Boolean).join("\n");
  const entregaDe = (u) => ({ direccion: [u.direccion, u.indicaciones].filter(Boolean).join(" · ").slice(0, 300), lat: u.lat, lng: u.lng });

  /** Opciones del select de lugar, con «📍 Usar mi ubicación» si existe un lugar de domicilio. */
  function opcionesLugar(sel, ubic) {
    const dom = lugarDomicilio();
    return RR.BUSINESS.locations.map((l) => `<option ${l === sel && !ubic ? "selected" : ""}>${RR.esc(l)}</option>`).join("")
      + (dom ? `<option value="__ubic" ${ubic ? "selected" : ""}>📍 ${ubic ? RR.esc(corta(ubic.direccion)) : "Usar mi ubicación (domicilio)"}</option>` : "");
  }
  /** Conecta un select de lugar con el mapa. `est` guarda loc (lugar) y ubic (dirección elegida). */
  function conectarLugar(selEl, notaEl, est) {
    const pintar = () => {
      selEl.innerHTML = opcionesLugar(est.loc, est.ubic);
      notaEl.classList.toggle("hidden", !est.ubic);
      notaEl.innerHTML = est.ubic ? `${I.pin}<span>Entrega en: <b>${RR.esc(est.ubic.direccion)}</b>${est.ubic.indicaciones ? ` · ${RR.esc(est.ubic.indicaciones)}` : ""} <button type="button" class="link-btn" data-cambiar>Cambiar</button></span>` : "";
      const c = notaEl.querySelector("[data-cambiar]"); if (c) c.addEventListener("click", abrir);
    };
    async function abrir() {
      const u = await elegirUbicacion({ titulo: "¿Dónde te entregamos el carro?", boton: "Entregar aquí", previa: est.ubic });
      if (u) { est.ubic = u; est.loc = lugarDomicilio(); }
      pintar();
    }
    selEl.addEventListener("change", () => {
      if (selEl.value === "__ubic") { abrir(); return; }
      est.loc = selEl.value; est.ubic = null; pintar();
    });
    pintar();
  }

  /* ---------- Modal de reserva ---------- */
  function openBooking(vid) {
    const v = RR.get.vehicle(vid);
    const b = { vid, start: search.start, end: search.end, loc: search.loc, ubic: search.ubic, step: 1, data: {}, docs: {} };
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
            <div class="sum"><div class="art">${v.fotos.length ? `<img src="${RR.esc(v.fotos[0])}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block">` : RR.carSVG(v.tipo, v.color)}</div><div><div class="bold">${RR.esc(v.marca)} ${RR.esc(v.modelo)} · ${v.anio}</div>${specs(v)}</div></div>
            <div class="form-grid">
              <div class="field full"><label for="bLoc">Lugar de recogida</label><select class="select" id="bLoc"></select><div class="loc-nota hidden" id="bLocNota"></div></div>
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
        conectarLugar($("#bLoc", root), $("#bLocNota", root), b);
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
              <label class="check full"><input type="checkbox" id="fMkt" ${d.mkt ? "checked" : ""}><span>Quiero recibir recordatorios y promociones por WhatsApp (opcional).</span></label>` : ""}`;
        root.innerHTML = head("Tus datos", "Paso 2 de 3 · Información del conductor principal") + `
          <form class="modal-body stack" id="bForm" novalidate>
            <div class="seg" style="width:100%"><button type="button" style="flex:1" data-modo="nuevo" class="${!hab ? "active" : ""}">Soy cliente nuevo</button><button type="button" style="flex:1" data-modo="habitual" class="${hab ? "active" : ""}">Ya he alquilado antes</button></div>
            <div class="form-grid">${campos}</div>
            <div id="fErr"></div>
          </form>
          <div class="modal-foot"><button class="btn" id="bBack">${I.back} Atrás</button><button class="btn btn-primary" id="bSend" ${hab && !b.habitual ? "disabled" : ""}>Enviar solicitud</button></div>`;
        const val = (id) => { const el = $(id, root); return el ? (el.type === "checkbox" ? el.checked : el.value.trim()) : undefined; };
        const collect = () => {
          const m = { nombre: val("#fName"), docNum: val("#fDoc"), birth: val("#fBirth"), tel: val("#fTel"), email: val("#fEmail"), lic: val("#fLic"), licV: val("#fLicV"), notas: val("#fNotes"), consent: val("#fConsent"), mkt: val("#fMkt") };
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
              notas: d2.notas || "", consentimiento: true, marketing: !!d2.mkt, entrega: b.ubic ? entregaDe(b.ubic) : undefined,
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
              ${b.ubic ? `<div class="row between" style="margin-top:8px;gap:12px"><span class="muted small">Entrega</span><span class="small" style="text-align:right">${RR.esc(b.ubic.direccion)}</span></div>` : ""}
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
    if (!chat.built) { buildPanel(); chat.built = true; chat.listo = iniciar(); }
    iniciarSondeo();
    setTimeout(() => $("#waText") && $("#waText").focus(), 50);
  }
  function closeChat() { chat.open = false; panel.classList.add("hidden"); clearInterval(chat.poll); }
  $("#fab").addEventListener("click", () => (chat.open ? closeChat() : openChat()));
  $$("[data-open-chat]").forEach((b) => b.addEventListener("click", openChat));
  // "Solicitar un conductor": abre el chat y el asistente toma los datos del viaje y se los envía a los conductores.
  $$("[data-conductor]").forEach((b) => b.addEventListener("click", async () => { openChat(); await chat.listo; if (!chat.enviando) formConductor(); }));
  setTimeout(() => $("#fabHint") && $("#fabHint").classList.add("hidden"), 9000);

  /* ---------- Chat: menú de opciones (botón ☰ o escribir «/») y formularios rápidos ---------- */
  const fechaTexto = (iso) => new Date(iso).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
  const ubicTexto = (u) => [u.direccion, u.indicaciones].filter(Boolean).join(" · ") + (u.lat != null ? `\nMapa: https://maps.google.com/?q=${u.lat.toFixed(6)},${u.lng.toFixed(6)}` : "");
  const COMANDOS = [
    { cmd: "cotizar", ic: "car", titulo: "Cotizar o reservar", desc: "Fechas, personas y lugar en un formulario", fn: () => formCotizar() },
    { cmd: "conductor", ic: "user", titulo: "Pedir un conductor", desc: "Te llevamos a donde vayas", fn: () => formConductor() },
    { cmd: "reservas", ic: "list", titulo: "Mis reservas", desc: "Consulta el estado de tus reservas", fn: () => formIdentidad("reservas") },
    { cmd: "cancelar", ic: "x", titulo: "Cancelar una reserva", desc: "Si ya no la necesitas o te equivocaste", fn: () => formIdentidad("cancelar") },
    { cmd: "ubicacion", ic: "pin", titulo: "Enviar mi ubicación", desc: "Para la entrega o la recogida", fn: () => enviarUbicacion() },
    { cmd: "asesor", ic: "chat", titulo: "Hablar con un asesor", desc: "Te atiende una persona", fn: () => enviar("Quiero hablar con un asesor") },
  ];
  const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function comandosQue(filtro) {
    const f = norm(filtro.replace(/^\//, "").trim());
    return COMANDOS.filter((c) => !f || c.cmd.startsWith(f) || norm(c.titulo).includes(f));
  }
  function pintarMenu(filtro = "") {
    const box = $("#waMenu"), lista = comandosQue(filtro);
    box.innerHTML = lista.length
      ? `<div class="wa-menu-t">Opciones · también puedes escribir <b>/</b></div>` + lista.map((c, i) => `<button type="button" class="wa-op ${i === 0 && filtro ? "sel" : ""}" data-cmd="${c.cmd}"><span class="ic">${I[c.ic]}</span><span class="grow"><b>${c.titulo}</b><small>${c.desc}</small></span><code>/${c.cmd}</code></button>`).join("")
      : `<div class="wa-menu-t">No hay una opción con «${RR.esc(filtro)}». Borra la barra para escribir normal.</div>`;
    box.classList.remove("hidden");
    $$("[data-cmd]", box).forEach((b) => b.addEventListener("click", () => ejecutarComando(b.dataset.cmd)));
  }
  const cerrarMenu = () => $("#waMenu") && $("#waMenu").classList.add("hidden");
  function ejecutarComando(cmd) {
    const c = COMANDOS.find((x) => x.cmd === cmd);
    cerrarMenu(); $("#waText").value = "";
    if (!c || chat.enviando) return;
    $$(".quick", body()).forEach((q) => q.remove());
    c.fn();
  }
  async function enviarUbicacion() {
    const u = await elegirUbicacion({ titulo: "Enviar mi ubicación", boton: "Enviar ubicación" });
    if (u) enviar(textoUbicacion(u));
  }

  /** Abre un formulario en ventana. armar(root) devuelve el texto a enviar o lanza Error con lo que falta. */
  function formulario(titulo, sub, html, armar, alAbrir) {
    const m = RR.openModal(`<div class="modal-head"><div class="grow"><h2>${titulo}</h2><p class="small muted" style="margin-top:4px">${sub}</p></div><button class="btn btn-ghost btn-icon" data-close aria-label="Cerrar">${I.x}</button></div>
      <form class="modal-body stack" novalidate><div class="form-grid">${html}</div><div data-err></div></form>
      <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${I.send}Enviar al asistente</button></div>`);
    m.el.querySelector(".modal").style.maxWidth = "560px";
    const root = m.el;
    // Botones de opción (una sola) y contadores.
    $$("[data-opciones]", root).forEach((g) => $$("button", g).forEach((b) => b.addEventListener("click", () => { $$("button", g).forEach((x) => x.classList.toggle("active", x === b)); })));
    $$("[data-contador]", root).forEach((g) => {
      const n = $("output", g), min = +g.dataset.min || 1, max = +g.dataset.max || 50;
      $$("button", g).forEach((b) => b.addEventListener("click", () => { n.value = String(Math.min(max, Math.max(min, +n.value + +b.dataset.paso))); }));
    });
    alAbrir && alAbrir(root);
    const enviarForm = () => {
      try { const t = armar(root); m.close(); enviar(t); }
      catch (e) { $("[data-err]", root).innerHTML = `<div class="callout err">${I.alert}<span>${RR.esc(e.message)}</span></div>`; }
    };
    $("[data-ok]", root).addEventListener("click", enviarForm);
    $("form", root).addEventListener("submit", (e) => { e.preventDefault(); enviarForm(); });
  }
  const opciones = (nombre, lista, activa) => `<div class="opciones" data-opciones="${nombre}">${lista.map((o) => `<button type="button" class="${o === activa ? "active" : ""}">${RR.esc(o)}</button>`).join("")}</div>`;
  const elegida = (root, nombre) => { const b = $(`[data-opciones="${nombre}"] button.active`, root); return b ? b.textContent : ""; };
  const contador = (id, valor, min, max) => `<div class="contador" data-contador id="${id}" data-min="${min}" data-max="${max}"><button type="button" data-paso="-1" aria-label="Menos">−</button><output>${valor}</output><button type="button" data-paso="1" aria-label="Más">+</button></div>`;
  const lineas = (pares) => pares.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "").map(([k, v]) => `${k}: ${v}`).join("\n");

  function formCotizar() {
    const est = { loc: search.loc, ubic: search.ubic };
    const ini = new Date(search.start), fin = new Date(search.end);
    formulario("Cotizar un vehículo", "Llena lo que sepas y el asistente te muestra las opciones disponibles.", `
      <div class="field full"><label>¿Para qué lo necesitas?</label>${opciones("uso", ["Paseo / turismo", "Trabajo", "Viaje fuera de Cali", "Evento", "Otro"], "Paseo / turismo")}</div>
      <div class="field"><label>¿Cuántas personas?</label>${contador("cPers", 2, 1, 15)}</div>
      <div class="field"><label>Maletas</label>${contador("cMal", 1, 0, 10)}</div>
      <div class="field full"><label>Tipo de vehículo</label>${opciones("tipo", ["Cualquiera", "Económico", "Sedán", "SUV", "Camioneta", "Van"], "Cualquiera")}</div>
      <div class="field"><label for="cIni">Recogida</label><input class="input" type="datetime-local" id="cIni" value="${RR.toLocalInput(ini)}" min="${RR.toLocalInput(new Date())}"></div>
      <div class="field"><label for="cFin">Devolución</label><input class="input" type="datetime-local" id="cFin" value="${RR.toLocalInput(fin)}"></div>
      <div class="field full"><label for="cLoc">Lugar de entrega</label><select class="select" id="cLoc"></select><div class="loc-nota hidden" id="cLocNota"></div></div>
      <div class="field full"><label for="cNotas">Comentarios (opcional)</label><input class="input" id="cNotas" maxlength="300" placeholder="Ej.: necesito silla para bebé, voy a Buga"></div>`,
      (root) => {
        const a = $("#cIni", root).value, b = $("#cFin", root).value;
        if (!a || !b) throw new Error("Elige la fecha y hora de recogida y de devolución.");
        if (!(new Date(b) > new Date(a))) throw new Error("La devolución debe ser posterior a la recogida.");
        if (new Date(a) < new Date(Date.now() - 3600000)) throw new Error("La fecha de recogida ya pasó.");
        return "🚗 Quiero cotizar un vehículo\n" + lineas([
          ["Para qué", elegida(root, "uso")], ["Personas", $("#cPers output", root).value], ["Maletas", $("#cMal output", root).value],
          ["Tipo de vehículo", elegida(root, "tipo")], ["Recogida", fechaTexto(a)], ["Devolución", fechaTexto(b)],
          ["Lugar", est.loc], ["Entrega en", est.ubic ? ubicTexto(est.ubic) : ""], ["Comentarios", $("#cNotas", root).value.trim()],
        ]);
      },
      (root) => conectarLugar($("#cLoc", root), $("#cLocNota", root), est));
  }

  function formConductor() {
    const t = new Date(Date.now() + 2 * 3600000); t.setMinutes(0, 0, 0);
    let origen = null;
    formulario("Pedir un conductor", "Nuestros conductores reciben tu pedido por WhatsApp y el primero que lo tome te recoge.", `
      <div class="field full"><label for="kO">¿Dónde te recogemos?</label><div class="row" style="gap:8px"><input class="input grow" id="kO" maxlength="200" placeholder="Dirección o lugar"><button type="button" class="btn" id="kOMapa">${I.pin}Mapa</button></div></div>
      <div class="field full"><label for="kD">¿A dónde vas?</label><input class="input" id="kD" maxlength="200" placeholder="Ej.: Aeropuerto, Felidia, Jamundí"></div>
      <div class="field"><label for="kF">Fecha y hora</label><input class="input" type="datetime-local" id="kF" value="${RR.toLocalInput(t)}" min="${RR.toLocalInput(new Date())}"></div>
      <div class="field"><label>Pasajeros</label>${contador("kP", 1, 1, 15)}</div>
      <div class="field full"><label>Viaje</label>${opciones("viaje", ["Solo ida", "Ida y vuelta"], "Solo ida")}</div>
      <div class="field full"><label for="kN">Detalles (opcional)</label><input class="input" id="kN" maxlength="300" placeholder="Equipaje, paradas, mascotas…"></div>`,
      (root) => {
        const o = $("#kO", root).value.trim(), d = $("#kD", root).value.trim(), f = $("#kF", root).value;
        if (o.length < 3) throw new Error("Escribe dónde te recogemos o elígelo en el mapa.");
        if (d.length < 2) throw new Error("Escribe a dónde vas.");
        if (!f || new Date(f) < new Date(Date.now() - 15 * 60000)) throw new Error("Elige una fecha y hora que no haya pasado.");
        const mapa = origen && origen.direccion === o.split(" · ")[0] && origen.lat != null ? `\nMapa: https://maps.google.com/?q=${origen.lat.toFixed(6)},${origen.lng.toFixed(6)}` : "";
        return "🚕 Quiero un servicio con conductor\n" + lineas([
          ["Recoger en", o + mapa], ["Destino", d], ["Fecha y hora", fechaTexto(f)], ["Pasajeros", $("#kP output", root).value],
          ["Viaje", elegida(root, "viaje")], ["Detalles", $("#kN", root).value.trim()],
        ]);
      },
      (root) => $("#kOMapa", root).addEventListener("click", async () => {
        const u = await elegirUbicacion({ titulo: "¿Dónde te recogemos?", boton: "Recoger aquí", previa: origen });
        if (u) { origen = u; $("#kO", root).value = [u.direccion, u.indicaciones].filter(Boolean).join(" · "); }
      }));
  }

  /** Mis reservas / cancelar: en la web se pide documento y celular para saber de quién son. */
  function formIdentidad(tipo) {
    const cancelar = tipo === "cancelar";
    formulario(cancelar ? "Cancelar una reserva" : "Mis reservas",
      cancelar ? "Las pre-reservas se cancelan sin costo. Las confirmadas, sin costo hasta 48 horas antes de la recogida." : "Usamos tu documento y celular para proteger tus datos.", `
      ${cancelar ? `<div class="field full"><label for="iCod">Código de la reserva (si lo tienes)</label><input class="input" id="iCod" maxlength="20" placeholder="Ej.: RR-1234" style="text-transform:uppercase"></div>` : ""}
      <div class="field"><label for="iDoc">Número de documento</label><input class="input" id="iDoc" inputmode="numeric" maxlength="20" placeholder="Cédula o pasaporte"></div>
      <div class="field"><label for="iTel">Celular</label><input class="input" id="iTel" inputmode="tel" maxlength="16" placeholder="300 123 4567"></div>
      ${cancelar ? `<div class="field full"><label>¿Por qué la cancelas?</label>${opciones("motivo", ["Ya no lo necesito", "Me equivoqué de vehículo", "Me equivoqué de fechas", "Otro motivo"], "Ya no lo necesito")}</div>` : ""}`,
      (root) => {
        const doc = $("#iDoc", root).value.trim(), tel = $("#iTel", root).value.trim();
        if (!/^[0-9A-Za-z.\- ]{5,20}$/.test(doc)) throw new Error("Escribe tu número de documento.");
        if (!/^\+?[0-9 ]{10,16}$/.test(tel)) throw new Error("Escribe tu celular (10 dígitos).");
        if (!cancelar) return "📋 Quiero ver mis reservas\n" + lineas([["Documento", doc], ["Celular", tel]]);
        const motivo = elegida(root, "motivo");
        const extra = /vehículo|fechas/.test(motivo) ? "\n(Quiero cambiarla por la opción correcta)" : "";
        return "❌ Quiero cancelar una reserva\n" + lineas([["Código", $("#iCod", root).value.trim().toUpperCase()], ["Documento", doc], ["Celular", tel], ["Motivo", motivo]]) + extra;
      });
  }

  function buildPanel() {
    panel.innerHTML = `<div class="wa">
      <div class="wa-head"><div class="wa-avatar" style="background:var(--ink);color:var(--gold)">${RR.marca.replace("<svg", '<svg width="24" height="15"')}</div><div><div class="wa-title">${RR.esc(RR.BUSINESS.name)}</div><div class="wa-sub" id="waStatus">en línea · asistente virtual</div></div><button class="x" id="waClose" aria-label="Cerrar">${I.x}</button></div>
      <div class="wa-body" id="waBody" aria-live="polite"></div>
      <div class="wa-menu hidden" id="waMenu" role="menu"></div>
      <form class="wa-input" id="waForm"><button type="button" class="wa-ubic" id="waOps" aria-label="Opciones" title="Opciones (o escribe /)">${I.list}</button><button type="button" class="wa-ubic" id="waUbic" aria-label="Enviar mi ubicación" title="Enviar mi ubicación">${I.pin}</button><input id="waText" placeholder="Escribe un mensaje o / para opciones" autocomplete="off" maxlength="1500"><button class="wa-send" aria-label="Enviar">${I.send}</button></form>
      <div class="wa-note">Asistente con IA · un asesor humano revisa y confirma cada reserva</div>
    </div>`;
    $("#waClose").addEventListener("click", closeChat);
    $("#waUbic").addEventListener("click", () => { if (!chat.enviando) { cerrarMenu(); enviarUbicacion(); } });
    $("#waOps").addEventListener("click", () => ($("#waMenu").classList.contains("hidden") ? pintarMenu() : cerrarMenu()));
    // Escribir «/» muestra las opciones y filtra mientras escribe (/cot, /cancelar…).
    $("#waText").addEventListener("input", (e) => { const v = e.target.value; if (v.startsWith("/")) pintarMenu(v); else cerrarMenu(); });
    $("#waText").addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarMenu();
      if (e.key === "Enter" && e.target.value.startsWith("/")) { e.preventDefault(); const c = comandosQue(e.target.value)[0]; if (c) ejecutarComando(c.cmd); }
    });
    $("#waForm").addEventListener("submit", (e) => {
      e.preventDefault(); const t = $("#waText").value.trim(); if (!t || chat.enviando) return;
      if (t.startsWith("/")) { const c = comandosQue(t)[0]; if (c) { ejecutarComando(c.cmd); return; } }
      cerrarMenu(); $("#waText").value = ""; enviar(t);
    });
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
    [["🚗 Cotizar un vehículo", "/cotizar"], ["🚕 Pedir un conductor", "/conductor"], ["📋 Mis reservas", "/reservas"], ["❌ Cancelar una reserva", "/cancelar"], ["Ver precios", "¿Cuáles son los precios?"], ["Requisitos", "¿Qué requisitos piden?"]]
      .forEach(([l, t]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.addEventListener("click", () => { if (t.startsWith("/")) { ejecutarComando(t.slice(1)); return; } q.remove(); enviar(t); }); q.appendChild(b); });
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
    burbuja("ia", `¡Hola! 👋 Soy el asistente virtual de ${RR.BUSINESS.name}. Te ayudo a cotizar y reservar un vehículo, o a pedir un servicio con conductor. Toca una opción o escribe tu mensaje (con */* ves el menú).`);
    if (!iaDisponible) burbuja("sistema", "El asistente automático no está activo en este momento. Escríbenos y un asesor te responderá, o usa el formulario de reserva.");
    sugerencias();
  }

  async function enviar(texto) {
    $$(".quick", body()).forEach((q) => q.remove());
    burbuja("cliente", texto);
    chat.enviando = true;
    const typing = document.createElement("div"); typing.className = "typing"; typing.innerHTML = "<i></i><i></i><i></i>";
    if (chat.estado !== "humano") { body().appendChild(typing); scroll(); $("#waStatus").textContent = "escribiendo…"; }
    try {
      const d = await RR.api("/api/chat", { conversacion: chat.conv || undefined, mensaje: texto });
      chat.conv = d.conversacion; chat.estado = d.estado;
      try { localStorage.setItem(CONV_KEY, d.conversacion); } catch (e) { /* sin almacenamiento */ }
      typing.remove();
      // Trae lo nuevo (respuesta de la IA y avisos del sistema) en orden.
      const n = await RR.api(`/api/chat/${chat.conv}?desde=${chat.ultimoId}`);
      n.mensajes.forEach((m) => { if (m.emisor !== "cliente") burbuja(m.emisor, m.texto, m.fecha); chat.ultimoId = m.id; });
      if (chat.estado === "humano" && !n.mensajes.some((m) => m.emisor !== "cliente")) burbuja("sistema", "Un asesor te responderá por aquí en breve.");
    } catch (err) {
      typing.remove();
      burbuja("sistema", err.message);
    } finally {
      chat.enviando = false;
      $("#waStatus").textContent = chat.estado !== "humano" ? "en línea · asistente virtual" : "en línea · te atiende un asesor";
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
        $("#waStatus").textContent = chat.estado !== "humano" ? "en línea · asistente virtual" : "en línea · te atiende un asesor";
      } catch (e) { /* reintenta en el siguiente ciclo */ }
    }, 6000);
  }

  /* ---------- Inicio ---------- */
  (async function () {
    try {
      await cargarCatalogo();
      renderInfo(); renderChips(); renderGrid(); renderGaleria(galeria);
    } catch (e) {
      $("#grid").innerHTML = `<div class="empty">No pudimos cargar el catálogo. Revisa tu conexión y recarga la página.</div>`;
    }
  })();
})();
