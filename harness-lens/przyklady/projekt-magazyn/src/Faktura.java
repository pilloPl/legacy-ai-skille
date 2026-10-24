public class Faktura {
    // rabat 5% dla stałych klientów, od 2011 także dla hurtowni (flaga h)
    public double kwota(double netto, boolean staly, boolean h) {
        double r = 0;
        if (staly) r = 0.05;
        if (h && netto > 10000) r = r + 0.03;
        return netto * (1 - r) * Stawki.vat("A");
    }
}
