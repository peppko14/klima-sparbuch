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

1. `mobility-tracker-card.js` nach `config/www/` kopieren.
2. Unter **Einstellungen → Dashboards → Ressourcen** eine neue Ressource
   hinzufügen: `/local/mobility-tracker-card.js`, Typ **JavaScript-Modul**.

## Einrichtung

1. Den Inhalt von `configuration-snippet.yaml` in deine `configuration.yaml`
   übernehmen (oder die Helper alternativ per UI unter
   **Einstellungen → Geräte & Dienste → Hilfsmittel** anlegen - dann bitte auf
   die gleichen Entity-IDs achten).
2. Home Assistant neu starten bzw. **Entwicklerwerkzeuge → YAML →
   Konfiguration neu laden**.
3. Die Karte gemäß `dashboard-example.yaml` in ein Dashboard einfügen und die
   `routes:`-Liste an deine eigenen Wege anpassen.

## Kartenoptionen

| Option             | Pflicht | Beschreibung                                              |
|--------------------|---------|-------------------------------------------------------------|
| `title`            | Nein    | Überschrift der Karte                                       |
| `total_km_entity`  | Ja      | `input_number`-Entity für die Gesamt-km                      |
| `co2_entity`       | Nein    | Sensor für CO₂ gespart (kg); ohne Angabe rechnet die Karte selbst mit Standardwerten |
| `trees_entity`     | Nein    | Sensor für Bäume-Äquivalent                                  |
| `money_entity`     | Nein    | Sensor für gespartes Spritgeld (€)                           |
| `routes`           | Nein    | Liste fester Wege: `name`, `km` (einfacher Weg), `mode` (`walk`/`bike`) |

## Anpassen der Annahmen

Die CO₂-, Verbrauchs- und Spritpreis-Werte sind eigene `input_number`-Helper
(`mobility_car_co2_g_per_km`, `mobility_fuel_consumption`,
`mobility_fuel_price`, `mobility_tree_kg_per_year`) und lassen sich jederzeit
über die normale Home-Assistant-Oberfläche anpassen - kein Karten-Update
nötig.

## Hinweis

Alle Berechnungen sind Richtwerte zur Orientierung und ersetzen keine exakte
CO₂-Bilanzierung.

## Später: Aufnahme in den offiziellen HACS-Store

Dieses Repository funktioniert bereits vollständig als **Custom Repository**
(siehe oben). Für eine Aufnahme in den offiziellen HACS-Standard-Store
(sichtbar für alle HACS-Nutzer ohne manuelles Hinzufügen) verlangt HACS
zusätzlich u. a. Screenshots im README, ein bestandenes GitHub-Action-Lint,
ein veröffentlichtes GitHub-Release und einen Pull Request gegen
[hacs/default](https://github.com/hacs/default) - die Prüfung dauert laut
HACS-Dokumentation üblicherweise mehrere Monate. Für den persönlichen
Gebrauch ist das nicht nötig.
