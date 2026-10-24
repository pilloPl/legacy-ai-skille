# Magazyn

Stary system magazynowy (2009). Przyjmuje dostawy, wystawia faktury, liczy stany.
Moduły: `src/Faktura.java` (faktury i rabaty), `zamrozone/Stawki.java` (stawki VAT — nie ruszać, audyt).
Schemat przepływu: `docs/schemat.png`. Stany są w bazie (serwer MCP „baza”), zgłoszenia w trackerze (MCP „tracker”).
