# Cloudflare Pages — atlas.kawka.pro

Projekt jest statyczny: `npm ci && npm run build`, katalog wynikowy `dist`. Domena docelowa została uzgodniona: `atlas.kawka.pro`. Repozytorium: `Adkins1/global-public-sector-atlas`.

## Wdrożenie przez GitHub Actions

1. Utwórz dedykowany token Cloudflare: **Account → Cloudflare Pages → Edit** dla konta zawierającego `kawka.pro`, a także **Zone → Zone → Read** i **Zone → DNS → Edit** wyłącznie dla strefy `kawka.pro`. Nie używaj Global API Key.
2. Zapisz token jako sekret repozytorium **CLOUDFLARE_API_TOKEN**. `CLOUDFLARE_ACCOUNT_ID` został już ustawiony. Wprowadzaj sekret w ustawieniach GitHub lub z lokalnego menedżera sekretów; nigdy w pliku repozytorium ani w rozmowie.
3. Uruchom workflow **Validate and build** na `main`. Po testach skrypt `scripts/cloudflare-setup.mjs project` utworzy projekt Pages `global-public-sector-atlas`, jeżeli jeszcze nie istnieje. Następnie Wrangler opublikuje `dist`.
4. Krok `domain` przypnie `atlas.kawka.pro` do Pages, a potem doda CNAME do rzeczywistej domeny projektu `*.pages.dev`. Istniejący konflikt DNS przerywa operację; skrypt nie nadpisuje rekordów. Aktywacja domeny i TLS może potrwać.
5. Sprawdź HTTPS, `/pl/`, `/en/`, `/data/observations.csv`, `sitemap-index.xml` oraz nagłówki z `_headers`. Sam poprawny build nie potwierdza wdrożenia.

Gdy token nie jest ustawiony, build i artifact działają, a wszystkie kroki wdrożenia są pomijane. Kod przygotowania Pages sprawdzono składniowo i względem oficjalnego API, ale nie wykonano operacji tworzenia przy obecnym tokenie (HTTP 403).

Rollback: wybierz poprzedni deployment w Pages. Dane i kod można odtworzyć z odpowiadającego commita Git.

## Synchronizacja

Workflow `Refresh official data` publikuje osobną gałąź `automation/data-refresh-<run_id>` i link do porównania z main. Użytkownik może z tego linku otworzyć PR. Bot nie ma uprawnienia do zatwierdzania PR; ustawienie repozytorium pozostało wyłączone. Zmiany wymagają przeglądu przed merge. Tygodniowy cron to 05:23 UTC w poniedziałki.

## Stan przy pierwszym przygotowaniu

Dostępny lokalny token Cloudflare pozwala odczytać strefę i DNS, lecz żądanie listy projektów Pages zwróciło HTTP 403. Nie utworzono rekordu DNS wskazującego na nieistniejący deployment. Do zakończenia publikacji konieczny jest token z uprawnieniem Pages Edit, zapisany lokalnie w SOPS lub bezpośrednio jako sekret GitHub.
