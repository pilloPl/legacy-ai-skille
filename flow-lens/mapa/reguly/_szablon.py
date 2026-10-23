"""Szablon reguł dla nowej technologii (C#/.NET, Python, PHP, TypeScript…). Skopiuj jako <tech>.py.

Umowa (jak entry-flows/rules):
- ORDER: kolejność; framework (np. aspnet 20, django 20) przed językiem (csharp 90, python 90).
- DETECT(p): czy technologia jest w projekcie (p.tekst() = próbka źródeł, p.klasy = klasy z CodeGraph).
- klasyfikuj(k) → (rola, powód, pewność) albo None. Role: wejscie | aplikacja | domena | repozytorium | pomin.
  Pewność: "pewne" | "do potwierdzenia" (trafia do pytań w propozycja.md).

Pliki z "_" na początku nie są ładowane.
"""
ORDER = 50

def DETECT(p):
    return False

def klasyfikuj(k):
    # wejście: kontrolery HTTP, konsumenci kolejek, joby
    # repozytorium: dostęp do bazy (ORM, DAO)
    # aplikacja: serwisy aplikacyjne / fasady / handlery
    # domena: encje, agregaty, polityki, serwisy domenowe
    # pomin: DTO, mapery, konfiguracja, wyjątki
    return None
