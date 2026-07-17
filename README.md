# Klima-Sparbuch Card

Eine Lovelace Custom Card für Home Assistant. Buche mit einem Klick feste Wege
(z. B. "Weg zur Kita", hin und zurück) oder trage individuelle Kilometer ein
und sieh sofort, wie viel CO₂, Bäume-Äquivalent und Spritgeld du dadurch im
Vergleich zum Auto gespart hast.

Alle Werte liegen als echte Home-Assistant-Entities vor (`input_number` +
Template-Sensoren) und lassen sich dadurch auch in Automationen, Statistiken
oder anderen Dashboards weiterverwenden. Jede Buchung wird zusätzlich ins
Home-Assistant-Logbuch geschrieben - das ist gleichzeitig das Ledger der Karte.

## Voraussetzungen

- Home Assistant
- [HACS](https://hacs.xyz) installiert

## Installation

### Als HACS Custom Repository (empfohlen für den Eigengebrauch)

1. Dieses Repository öffentlich auf GitHub veröffentlichen.
2. In Home Assistant: **HACS → Dreipunktmenü → Benutzerdefinierte Repositories**.
3. Repository-URL eintragen, Kategorie **Dashboard** wählen, hinzufügen.
4. "Klima-Sparbuch Card" in HACS suchen und installieren.
5. Home Assistant neu laden (bzw. die Ressource wird von HACS automatisch
   eingebunden).

### Manuell (ohne HACS)

1. `klima-sparbuch.js` nach `config/www/` kopieren.
2. Unter **Einstellungen → Dashboards → Ressourcen** eine neue Ressource
   hinzufügen: `/local/klima-sparbuch.js`, Typ **JavaScript-Modul**.

## Einrichtung

1. Den Inhalt von `configuration-snippet.yaml` in deine `configuration.yaml`
   übernehmen (oder die Helper alternativ per UI unter
   **Einstellungen → Geräte & Dienste → Hilfsmittel** anlegen - dann bitte auf
   die gleichen Entity-IDs achten).
2. Home Assistant neu starten bzw. **Entwicklerwerkzeuge → YAML →
   Konfiguration neu laden**.
3. **Live-Spritpreis einrichten (Tankerkönig):**
   - Kostenlosen API-Key auf [tankerkoenig.de](https://creativecommons.tankerkoenig.de/) beantragen.
   - In Home Assistant: **Einstellungen → Geräte & Dienste → Integration hinzufügen → Tankerkönig**.
   - API-Key eingeben, gewünschte Tankstelle(n) in der Nähe auswählen.
   - Unter **Entwicklerwerkzeuge → Zustände** nach `tankerkoenig` filtern, um die
     Entity-ID für deinen Kraftstoff zu finden (z. B.
     `sensor.tankerkoenig_<stationsname>_e10`).
   - Diese Entity-ID als `fuel_price_entity` in der Kartenkonfiguration eintragen.
   - Ist die Tankstelle gerade geschlossen (Sensor "unavailable"), greift die
     Karte automatisch auf `input_number.mobility_fuel_price` zurück - diesen
     Wert also ab und zu manuell aktuell halten, falls das öfter vorkommt.
4. Die Karte gemäß `dashboard-example.yaml` in ein Dashboard einfügen und die
   `routes:`-Liste an deine eigenen Wege anpassen.

## Kartenoptionen

| Option                       | Pflicht | Beschreibung                                              |
|------------------------------|---------|-----------------------------------------------------------|
| `title`                      | Nein    | Überschrift der Karte                                       |
| `total_km_entity`            | Ja      | `input_number`-Entity für die Gesamt-km                      |
| `co2_entity`                 | Nein    | Sensor für CO₂ gespart (kg); ohne Angabe rechnet die Karte selbst mit Standardwerten |
| `trees_entity`               | Nein    | Sensor für Bäume-Äquivalent                                  |
| `money_entity`                | Nein    | `input_number`-Zähler für gespartes Spritgeld (€) - wird pro Buchung erhöht, nicht rückwirkend neu berechnet |
| `fuel_price_entity`           | Nein    | Sensor mit dem aktuellen Spritpreis (z. B. von Tankerkönig); wird pro Buchung eingefroren |
| `fuel_price_fallback_entity`  | Nein    | `input_number`, Default `input_number.mobility_fuel_price` - greift, wenn `fuel_price_entity` fehlt oder "unavailable" ist |
| `consumption_entity`          | Nein    | `input_number`, Default `input_number.mobility_fuel_consumption` |
| `routes`                      | Nein    | Liste fester Wege: `name`, `km` (einfacher Weg) - wird beim Buchen automatisch verdoppelt (Hin+Rück). Beliebig viele Einträge möglich - für ein weiteres Preset einfach einen weiteren Eintrag in die Liste hinzufügen. |

## Wie der Spritpreis berechnet wird

Für jede Buchung (egal ob über einen Wege-Button oder die individuelle
Eingabe) gilt:

1. Die Karte liest `fuel_price_entity` (Live-Preis, z. B. Tankerkönig) aus.
2. Ist dieser nicht verfügbar, wird `fuel_price_fallback_entity`
   (`input_number.mobility_fuel_price`) genutzt.
3. Aus diesem Preis und `consumption_entity` wird der Betrag für GENAU DIESE
   Fahrt berechnet und zu `money_entity` addiert.

Bereits gebuchte Fahrten werden dadurch nie rückwirkend verändert, auch wenn
der Spritpreis später steigt oder fällt. Im Logbuch-Eintrag jeder Buchung
steht zusätzlich, welcher Preis verwendet wurde und aus welcher Quelle
(`live`, `manuell hinterlegt` oder `Standardwert`).

## Anpassen der Annahmen

Die CO₂-, Verbrauchs- und Fallback-Spritpreis-Werte sind eigene
`input_number`-Helper (`mobility_car_co2_g_per_km`, `mobility_fuel_consumption`,
`mobility_fuel_price`, `mobility_tree_kg_per_year`) und lassen sich jederzeit
über die normale Home-Assistant-Oberfläche anpassen - kein Karten-Update
nötig.

## Hinweis

Alle Berechnungen sind Richtwerte zur Orientierung und ersetzen keine exakte
CO₂-Bilanzierung.
