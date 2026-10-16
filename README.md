# Klucze RM

PWA szafki z kluczami (zbudowana 16.10.2026). Numer = haczyk w szafce, na zawieszce tylko numer, adres wyłącznie w aplikacji.

- **Szafka:** siatka haczyków (zielony w szafce, pomarańczowy wydany, czerwony po terminie), filtry, szukanie, „Masz u siebie” z przyciskiem Oddaję.
- **Karta klucza:** wydanie (komu: ktoś z zespołu albo spoza biura z telefonem; po co; wraca dziś/jutro/za 2 dni/data), zwrot jednym kliknięciem, przedłużenie, historia, edycja, „Oddane właścicielowi” (archiwum, haczyk wolny).
- **Przyjęcie:** adres, właściciel, liczba kompletów; każdy komplet dostaje najniższy wolny haczyk.
- **Kontrola (piątek 14:45):** jest/brak przy każdym haczyku, różnice na czerwono, zapis w `klucze_kontrole`.
- **Po terminie:** pg_cron `rm-klucze` (8:00 i 13:00) tworzy zadanie w Zadaniach RM (z powiadomieniem); zwrot klucza zamyka zadanie sam (trigger).
- Link `?h=4` otwiera haczyk 4 (pod kody QR na zawieszkach, wersja 2).

Dane w bazie Zadań RM (Supabase `zadania-rm`), to samo logowanie, tabele z `setup.sql` (startowe 14 kluczy ze spisu 15.10.2026). Tryb próbny: `index.html?proba`.
Wydanie: podbij `WERSJA` w app.js, `?v=` w index.html i `CACHE` w sw.js, potem `bash publikuj.sh "opis"`.
