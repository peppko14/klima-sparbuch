/**
 * Klima-Sparbuch / Mobility Tracker Card
 * Custom Lovelace Card für Home Assistant.
 *
 * Speichert nichts selbst - liest/schreibt echte Home Assistant Entities:
 *  - total_km_entity            (input_number, Pflicht) -> Gesamt-km, wird bei jeder Buchung erhöht
 *  - co2_entity                 (sensor, optional)       -> CO2 gespart in kg (Template-Sensor)
 *  - trees_entity               (sensor, optional)       -> Bäume-Äquivalent (Template-Sensor)
 *  - money_entity               (input_number, Pflicht für Geld-Tracking)
 *                                  -> gespartes Spritgeld in €, wird bei jeder Buchung
 *                                     um den Betrag DIESER Fahrt erhöht (nicht neu berechnet!)
 *  - fuel_price_entity          (sensor, optional)  -> Live-Spritpreis, z. B. von der
 *                                     Tankerkönig-Integration. Wird zum Zeitpunkt jeder
 *                                     Buchung ausgelesen und für diese Fahrt "eingefroren".
 *  - fuel_price_fallback_entity (input_number, optional, Default: input_number.mobility_fuel_price)
 *                                  -> wird genutzt, wenn fuel_price_entity fehlt oder gerade
 *                                     "unavailable"/"unknown" ist (z. B. Tankstelle geschlossen).
 *  - consumption_entity         (input_number, optional, Default: input_number.mobility_fuel_consumption)
 *
 * Fehlen co2/trees Entities, rechnet die Karte mit eingebauten Standardwerten
 * (siehe DEFAULTS) selbst - damit sie auch ohne Template-Sensoren sofort nutzbar ist.
 *
 * Der Spritpreis wird PRO BUCHUNG eingefroren und direkt in money_entity aufaddiert.
 * Ändert sich der Preis später, wirkt sich das nicht rückwirkend auf bereits
 * gebuchte Fahrten aus.
 *
 * Jede Buchung wird zusätzlich per logbook.log ins Home Assistant Logbuch
 * geschrieben (inkl. des an diesem Tag verwendeten Spritpreises) und von dort
 * für die "Letzte Buchungen"-Liste wieder abgerufen.
 */

const DEFAULTS = {
  co2GPerKm: 120,
  consumptionLPer100: 6.5,
  fuelPriceEurPerL: 1.75,
  treeKgPerYear: 12.5
};

function fmtDE(value, decimals) {
  const num = Number(value);
  if (Number.isNaN(num)) return "–";
  return num.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function modeIcon(mode) {
  return mode === "bike" ? "🚲" : "🚶";
}

function modeLabel(mode) {
  return mode === "bike" ? "Rad" : "zu Fuß";
}

function treeGlyph(color) {
  return `<svg viewBox="0 0 20 34" width="14" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="24" width="4" height="8" fill="${color}" opacity="0.7"/>
    <path d="M10 0L18 16H13L18 22H12L16 30H4L8 22H2L7 16H2L10 0Z" fill="${color}"/>
  </svg>`;
}

class MobilityTrackerCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Klima-Sparbuch",
      total_km_entity: "input_number.mobility_total_km",
      co2_entity: "sensor.mobility_co2_saved",
      trees_entity: "sensor.mobility_trees_saved",
      money_entity: "input_number.mobility_total_money_saved",
      fuel_price_entity: "sensor.tankerkoenig_deine_tankstelle_e10",
      consumption_entity: "input_number.mobility_fuel_consumption",
      fuel_price_fallback_entity: "input_number.mobility_fuel_price",
      routes: [
        { name: "Weg zur Kita", km: 1.2, mode: "walk" }
      ]
    };
  }

  setConfig(config) {
    if (!config || !config.total_km_entity) {
      throw new Error(
        "mobility-tracker-card: 'total_km_entity' muss in der Kartenkonfiguration angegeben werden (ein input_number Helper)."
      );
    }
    this._config = Object.assign({
      title: "Klima-Sparbuch",
      routes: [],
      consumption_entity: "input_number.mobility_fuel_consumption",
      fuel_price_fallback_entity: "input_number.mobility_fuel_price"
    }, config);
    this._logbook = [];
    this._logbookLoaded = false;

    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = this._staticMarkup();
      this._wireStaticEvents();
    }

    this.shadowRoot.querySelector(".title").textContent = this._config.title;
    this._renderRouteButtons();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) return;
    this._renderValues();
    if (!this._logbookLoaded) {
      this._logbookLoaded = true;
      this._fetchLogbook();
    }
  }

  getCardSize() {
    return 7;
  }

  // ---------------------------------------------------------------------
  // Markup / Styles
  // ---------------------------------------------------------------------

  _staticMarkup() {
    return `
      <style>${this._css()}</style>
      <ha-card>
        <div class="card-content">
          <div class="header"><div class="title"></div></div>

          <div class="hero">
            <div class="eyebrow">Insgesamt eingespart</div>
            <div class="odometer"><span class="odometer-value">–</span><span class="unit">km</span></div>
            <div class="ticks"></div>
          </div>

          <div class="stat-grid">
            <div class="stat-card co2-card">
              <div class="label">CO&#8322; vermieden</div>
              <div class="cloud-row">
                <svg class="cloud-svg" viewBox="0 0 64 44" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 34c-7 0-12-5-12-11 0-5.5 4-10 9.5-10.8C17 7 22.5 3 29 3c7 0 13 5 14.3 11.6C49 15.4 53 20 53 25.5 53 31.5 48 36 42 36H18z"
                        fill="var(--mtc-sky-dim)" stroke="var(--mtc-sky)" stroke-width="1.5"/>
                </svg>
                <div class="value co2-value">–</div>
              </div>
            </div>

            <div class="stat-card tree-card">
              <div class="label">Bäume-Äquivalent</div>
              <div class="tree-row"></div>
              <div class="value tree-value">–</div>
            </div>

            <div class="stat-card coin-card">
              <div class="text-block">
                <div class="label">Spritgeld gespart</div>
                <div class="value money-value">–</div>
              </div>
              <svg class="coin-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"></svg>
            </div>
          </div>

          <div class="section-title">Deine Wege</div>
          <div class="route-btn-list"></div>

          <div class="section-title">Eigene km eingeben</div>
          <form class="custom-entry">
            <div class="field">
              <label>km (gesamt)</label>
              <input type="number" class="custom-km" min="0" step="0.1" placeholder="z. B. 4.8" required>
            </div>
            <div class="field">
              <label>Fortbewegung</label>
              <select class="custom-mode">
                <option value="walk">🚶 zu Fuß</option>
                <option value="bike">🚲 Rad</option>
              </select>
            </div>
            <div class="field grow">
              <label>Bezeichnung</label>
              <input type="text" class="custom-label" placeholder="z. B. Einkauf">
            </div>
            <button type="submit" class="btn">Eintragen</button>
          </form>
          <div class="form-error"></div>

          <div class="section-title">Letzte Buchungen</div>
          <div class="ledger"><div class="ledger-empty">Noch keine Buchungen.</div></div>
        </div>
      </ha-card>
    `;
  }

  _css() {
    return `
      :host {
        --mtc-moss: #6ea975;
        --mtc-moss-strong: #4f8a58;
        --mtc-moss-dim: rgba(110,169,117,0.16);
        --mtc-amber: #c98f2e;
        --mtc-amber-strong: #a97722;
        --mtc-amber-dim: rgba(201,143,46,0.16);
        --mtc-sky: #4c85a8;
        --mtc-sky-strong: #386d8d;
        --mtc-sky-dim: rgba(76,133,168,0.16);
        --mtc-mono: 'JetBrains Mono', 'Roboto Mono', monospace;
        display: block;
      }
      .card-content { padding: 16px; }
      .header { display:flex; align-items:center; margin-bottom:10px; }
      .title {
        font-size: 18px; font-weight: 600;
        color: var(--primary-text-color);
      }
      .hero {
        background: var(--secondary-background-color, rgba(127,127,127,0.08));
        border-radius: 12px; padding: 14px 16px 10px; margin-bottom: 14px;
      }
      .eyebrow {
        text-transform: uppercase; letter-spacing: 1.2px; font-size: 10.5px;
        color: var(--secondary-text-color); font-weight: 600; margin-bottom: 4px;
      }
      .odometer {
        font-family: var(--mtc-mono); font-weight: 700; font-size: 36px;
        color: var(--mtc-moss-strong); line-height:1;
        display:flex; align-items:baseline; gap:8px;
      }
      .odometer .unit { font-size: 14px; color: var(--secondary-text-color); font-weight: 500; }
      .ticks {
        margin-top: 10px; height: 6px; border-radius: 2px; opacity: 0.7;
        background-image: repeating-linear-gradient(90deg, var(--mtc-moss-dim) 0 2px, transparent 2px 10px);
      }
      .stat-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
      @media (max-width: 480px) { .stat-grid { grid-template-columns: 1fr; } }
      .stat-card {
        border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px;
        display:flex; flex-direction:column; gap:8px;
      }
      .stat-card .label {
        font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px;
        color: var(--secondary-text-color); font-weight: 600;
      }
      .stat-card .value { font-family: var(--mtc-mono); font-weight: 700; font-size: 18px; color: var(--primary-text-color); }
      .co2-card .value { color: var(--mtc-sky-strong); }
      .tree-card .value { color: var(--mtc-moss-strong); }
      .coin-card .value { color: var(--mtc-amber-strong); }
      .cloud-row { display:flex; align-items:center; gap:8px; }
      .cloud-svg { width: 40px; height: 28px; flex: none; }
      .tree-row { display:flex; gap:2px; align-items:flex-end; height: 22px; flex-wrap:wrap; }
      .coin-card { flex-direction: row; align-items:center; justify-content:space-between; }
      .coin-svg { width: 48px; height: 48px; flex: none; }

      .section-title {
        font-size: 13.5px; font-weight: 600; color: var(--primary-text-color);
        margin: 16px 0 8px;
      }
      .route-btn-list { display:flex; flex-direction:column; gap:8px; }
      .route-btn {
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        border:1px solid var(--divider-color); border-radius: 10px; padding: 10px 12px;
        background: none; cursor:pointer; color: var(--primary-text-color); text-align:left;
        font: inherit;
      }
      .route-btn:hover { background: var(--mtc-moss-dim); }
      .route-btn .rb-left { display:flex; align-items:center; gap:10px; }
      .route-btn .rb-icon {
        width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        background: var(--mtc-moss-dim); font-size:14px; flex:none;
      }
      .route-btn .rb-name { font-weight:600; font-size:13.5px; }
      .route-btn .rb-dist { font-size:11.5px; color: var(--secondary-text-color); }
      .route-btn .rb-cta {
        font-family: var(--mtc-mono); font-size:11.5px; color: var(--mtc-moss-strong);
        border:1px dashed var(--mtc-moss); border-radius:8px; padding:5px 9px; white-space:nowrap;
      }

      .custom-entry { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
      .field { display:flex; flex-direction:column; gap:4px; }
      .field.grow { flex:1; min-width:130px; }
      .field label { font-size:11px; color: var(--secondary-text-color); font-weight:600; }
      .field input, .field select {
        background: var(--card-background-color); color: var(--primary-text-color);
        border:1px solid var(--divider-color); border-radius:8px; padding:7px 9px; font: inherit; font-size:13.5px;
        min-width: 100px;
      }
      .btn {
        background: var(--mtc-moss-strong); color:#fff; border:none; border-radius:8px;
        padding:8px 16px; font-weight:700; font-size:13.5px; cursor:pointer; font:inherit;
      }
      .btn:hover { opacity:0.9; }
      .form-error { color: #c0392b; font-size:12px; min-height: 16px; margin-top:4px; }

      .ledger { display:flex; flex-direction:column; gap:6px; }
      .ledger-empty { color: var(--secondary-text-color); font-size:12.5px; }
      .ledger-row {
        display:flex; align-items:center; gap:10px; border:1px solid var(--divider-color);
        border-radius:9px; padding:8px 10px;
      }
      .ledger-icon {
        width:26px; height:26px; border-radius:50%; border:1.5px dashed var(--mtc-moss);
        display:flex; align-items:center; justify-content:center; flex:none; font-size:12.5px;
      }
      .ledger-main { flex:1; }
      .ledger-msg { font-size:12.5px; color: var(--primary-text-color); }
      .ledger-time { font-size:11px; color: var(--secondary-text-color); font-family: var(--mtc-mono); }
    `;
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  _wireStaticEvents() {
    const form = this.shadowRoot.querySelector(".custom-entry");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const errorEl = this.shadowRoot.querySelector(".form-error");
      errorEl.textContent = "";
      const kmInput = this.shadowRoot.querySelector(".custom-km");
      const modeInput = this.shadowRoot.querySelector(".custom-mode");
      const labelInput = this.shadowRoot.querySelector(".custom-label");

      const km = parseFloat(kmInput.value);
      if (!(km > 0)) {
        errorEl.textContent = "Bitte eine gültige Kilometerzahl größer als 0 eingeben.";
        return;
      }
      const label = labelInput.value.trim() || "Eigene Eingabe";
      this._logTrip(km, modeInput.value, label);
      kmInput.value = "";
      labelInput.value = "";
    });
  }

  _renderRouteButtons() {
    const list = this.shadowRoot.querySelector(".route-btn-list");
    const routes = this._config.routes || [];
    if (routes.length === 0) {
      list.innerHTML = `<div class="ledger-empty">Keine Wege konfiguriert. Füge "routes:" in der Kartenkonfiguration hinzu.</div>`;
      return;
    }
    list.innerHTML = routes.map((r, i) => {
      const roundTrip = r.km * 2;
      return `
        <button class="route-btn" data-index="${i}" type="button">
          <span class="rb-left">
            <span class="rb-icon">${modeIcon(r.mode)}</span>
            <span>
              <div class="rb-name">${this._escape(r.name)}</div>
              <div class="rb-dist">${fmtDE(r.km, 1)} km einfach · ${fmtDE(roundTrip, 1)} km Hin+Rück</div>
            </span>
          </span>
          <span class="rb-cta">+ ${fmtDE(roundTrip, 1)} km buchen</span>
        </button>`;
    }).join("");

    list.querySelectorAll(".route-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = routes[parseInt(btn.dataset.index, 10)];
        if (route) this._logTrip(route.km * 2, route.mode, route.name);
      });
    });
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------
  // Data / Services
  // ---------------------------------------------------------------------

  _fallbackCalc(totalKm) {
    const co2Kg = totalKm * (DEFAULTS.co2GPerKm / 1000);
    const trees = DEFAULTS.treeKgPerYear > 0 ? co2Kg / DEFAULTS.treeKgPerYear : 0;
    return { co2Kg, trees };
  }

  // Ermittelt den Spritpreis, der für die JETZT stattfindende Buchung
  // eingefroren wird: bevorzugt eine Live-Quelle (z. B. Tankerkönig),
  // sonst der manuell gepflegte Fallback-Helper, sonst ein Default.
  _readFuelPrice() {
    const cfg = this._config;
    if (cfg.fuel_price_entity && this._hass.states[cfg.fuel_price_entity]) {
      const live = this._hass.states[cfg.fuel_price_entity];
      const liveVal = parseFloat(live.state);
      if (!Number.isNaN(liveVal) && live.state !== "unavailable" && live.state !== "unknown") {
        return { price: liveVal, source: "live" };
      }
    }
    const fallbackId = cfg.fuel_price_fallback_entity || "input_number.mobility_fuel_price";
    const fallbackEntity = this._hass.states[fallbackId];
    const fallbackVal = fallbackEntity ? parseFloat(fallbackEntity.state) : NaN;
    if (!Number.isNaN(fallbackVal)) {
      return { price: fallbackVal, source: "fallback" };
    }
    return { price: DEFAULTS.fuelPriceEurPerL, source: "default" };
  }

  _renderValues() {
    if (!this._hass) return;
    const totalEntity = this._hass.states[this._config.total_km_entity];
    const totalKm = totalEntity ? parseFloat(totalEntity.state) || 0 : 0;
    this.shadowRoot.querySelector(".odometer-value").textContent = fmtDE(totalKm, 1);

    const co2Entity = this._config.co2_entity && this._hass.states[this._config.co2_entity];
    const treesEntity = this._config.trees_entity && this._hass.states[this._config.trees_entity];
    const moneyEntity = this._config.money_entity && this._hass.states[this._config.money_entity];

    let co2Kg, trees;
    if (co2Entity && treesEntity && !Number.isNaN(parseFloat(co2Entity.state))) {
      co2Kg = parseFloat(co2Entity.state) || 0;
      trees = parseFloat(treesEntity.state) || 0;
    } else {
      const fb = this._fallbackCalc(totalKm);
      co2Kg = fb.co2Kg;
      trees = fb.trees;
    }

    // Geld kommt IMMER direkt aus money_entity - das ist ein Zähler, der pro
    // Buchung um den an diesem Tag geltenden Betrag erhöht wird, keine
    // rückwirkende Neuberechnung aus totalKm.
    const money = moneyEntity && !Number.isNaN(parseFloat(moneyEntity.state))
      ? parseFloat(moneyEntity.state)
      : null;

    this.shadowRoot.querySelector(".co2-value").textContent = fmtDE(co2Kg, 1) + " kg";
    this.shadowRoot.querySelector(".tree-value").textContent = fmtDE(trees, 1) + " Bäume";

    const treeRow = this.shadowRoot.querySelector(".tree-row");
    const visible = Math.min(10, Math.max(1, Math.round(trees)));
    let treeHtml = "";
    for (let i = 0; i < visible; i++) {
      treeHtml += treeGlyph(trees >= 1 ? "var(--mtc-moss-strong)" : "var(--mtc-moss-dim)");
    }
    treeRow.innerHTML = treeHtml + (trees > 10 ? `<span style="align-self:center;font-size:11px;color:var(--secondary-text-color);margin-left:2px;">+${fmtDE(trees - 10, 1)}</span>` : "");

    this.shadowRoot.querySelector(".money-value").textContent = money === null ? "–" : fmtDE(money, 2) + " €";
    const coinSvg = this.shadowRoot.querySelector(".coin-svg");
    const coinCount = money === null ? 1 : Math.min(6, Math.max(1, Math.round(money / 5)));
    let coinHtml = "";
    for (let i = 0; i < coinCount; i++) {
      const y = 46 - i * 6;
      coinHtml += `<ellipse cx="24" cy="${y}" rx="18" ry="7" fill="var(--mtc-amber-dim)" stroke="var(--mtc-amber)" stroke-width="1.5"/>`;
    }
    coinSvg.innerHTML = coinHtml;
  }

  async _logTrip(km, mode, label) {
    if (!this._hass || !this._config.total_km_entity) return;
    const entity = this._hass.states[this._config.total_km_entity];
    const current = entity ? parseFloat(entity.state) || 0 : 0;
    const newTotal = Math.round((current + km) * 100) / 100;

    // Spritpreis für GENAU DIESE Buchung einfrieren (live-Quelle bevorzugt).
    const { price, source } = this._readFuelPrice();
    const consumptionEntity = this._hass.states[this._config.consumption_entity];
    const consumption = consumptionEntity && !Number.isNaN(parseFloat(consumptionEntity.state))
      ? parseFloat(consumptionEntity.state)
      : DEFAULTS.consumptionLPer100;
    const costPerKm = (consumption / 100) * price;
    const tripMoney = Math.round(km * costPerKm * 100) / 100;

    try {
      await this._hass.callService("input_number", "set_value", {
        entity_id: this._config.total_km_entity,
        value: newTotal
      });

      if (this._config.money_entity && this._hass.states[this._config.money_entity]) {
        const moneyEntity = this._hass.states[this._config.money_entity];
        const currentMoney = parseFloat(moneyEntity.state) || 0;
        const newMoney = Math.round((currentMoney + tripMoney) * 100) / 100;
        await this._hass.callService("input_number", "set_value", {
          entity_id: this._config.money_entity,
          value: newMoney
        });
      }

      const sourceLabel = source === "live" ? "live" : source === "fallback" ? "manuell hinterlegt" : "Standardwert";
      await this._hass.callService("logbook", "log", {
        name: this._config.title || "Klima-Sparbuch",
        message: `${label}: ${fmtDE(km, 1)} km (${modeLabel(mode)}) gebucht · ${fmtDE(tripMoney, 2)} € gespart (Spritpreis ${fmtDE(price, 2)} €/l, ${sourceLabel})`,
        entity_id: this._config.total_km_entity
      });
      this._fetchLogbook();
    } catch (err) {
      const errorEl = this.shadowRoot.querySelector(".form-error");
      errorEl.textContent = "Buchung fehlgeschlagen: " + (err && err.message ? err.message : err);
    }
  }

  async _fetchLogbook() {
    if (!this._hass || !this._config.total_km_entity) return;
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const entries = await this._hass.callApi(
        "GET",
        `logbook/${since}?entity=${this._config.total_km_entity}`
      );
      this._logbook = (entries || []).slice(-8).reverse();
    } catch (err) {
      this._logbook = [];
    }
    this._renderLedger();
  }

  _renderLedger() {
    const el = this.shadowRoot.querySelector(".ledger");
    if (!this._logbook || this._logbook.length === 0) {
      el.innerHTML = `<div class="ledger-empty">Noch keine Buchungen.</div>`;
      return;
    }
    el.innerHTML = this._logbook.map((entry) => {
      const when = entry.when ? new Date(entry.when) : null;
      const whenStr = when
        ? when.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "";
      return `
        <div class="ledger-row">
          <div class="ledger-icon">📘</div>
          <div class="ledger-main">
            <div class="ledger-msg">${this._escape(entry.message || "")}</div>
            <div class="ledger-time">${whenStr}</div>
          </div>
        </div>`;
    }).join("");
  }
}

customElements.define("mobility-tracker-card", MobilityTrackerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "mobility-tracker-card",
  name: "Klima-Sparbuch",
  description: "Trackt CO2, Bäume-Äquivalent und Spritgeld für zu Fuß oder mit dem Rad zurückgelegte Wege."
});
