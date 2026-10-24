public class Stawki {
    // stawka "A" = 23%, "B" = 8% (zmienione w 2011, stara nazwa zmiennej zostala)
    public static double vat(String grupa) {
        return grupa.equals("A") ? 1.23 : 1.08;
    }
}
