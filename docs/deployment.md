# Cloudflare Pages — atlas.kawka.pro

Projekt jest statyczny: `npm ci && npm run build`, katalog wynikowy `dist`. Domena docelowa została uzgodniona: `atlas.kawka.pro`. Repozytorium: `Adkins1/global-public-sector-atlas`.

## Wdrożenie przez GitHub Actions

1. W koncie Cloudflare zawierającym `kawka.pro` utwórz projekt Pages `global-public-sector-atlas` (Direct Upload). Nie jest potrzebny adapter SSR.
2. Token API musi mieć **Account → Cloudflare Pages → Edit**, ograniczone do właściwego konta. Do przypięcia DNS wymagane jest osobno Zone → DNS → Edit dla `kawka.pro`. Nie używaj Global API Key.
3. Ustaw sekrety GitHub repo: `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`. Wprowadzaj wartości w ustawieniach GitHub lub z lokalnego menedżera sekretów; nigdy w pliku repozytorium ani w rozmowie.
4. Uruchom `Validate and build` na `main`. Po testach workflow publikuje `dist` na Pages. Gdy token nie jest ustawiony, build i artifact działają, a deploy jest pomijany.
5. W Pages → Custom domains dodaj `atlas.kawka.pro`, a następnie odpowiedni rekord CNAME do przydzielonej domeny `*.pages.dev`. Najpierw przypnij domenę w Pages, potem DNS. Nie zastępuj istniejącego rekordu bez sprawdzenia.
6. Sprawdź HTTPS, `/pl/`, `/en/`, `/data/observations.csv`, `sitemap-index.xml` oraz nagłówki z `_headers`.

Rollback: wybierz poprzedni deployment w Pages. Dane i kod można odtworzyć z odpowiadającego commita Git.

## Synchronizacja

Workflow `Refresh official data` tworzy PR z odświeżeniem snapshotów. W repo Settings → Actions → General musi być dozwolone tworzenie pull requestów przez GitHub Actions. PR wymaga przeglądu danych przed merge. Tygodniowy cron to 05:23 UTC w poniedziałki.

## Stan przy pierwszym przygotowaniu

Dostępny lokalny token Cloudflare pozwala odczytać strefę i DNS, lecz żądanie listy projektów Pages zwróciło HTTP 403. Nie utworzono rekordu DNS wskazującego na nieistniejący deployment. Do zakończenia publikacji konieczny jest token z uprawnieniem Pages Edit, zapisany lokalnie w SOPS lub bezpośrednio jako sekret GitHub.
