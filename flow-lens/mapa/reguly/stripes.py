"""Reguły Stripes (Java): ActionBean (implements ActionBean, także przez bazę *ActionBean, albo @UrlBinding) to wejście
HTTP — zdarzenie = metoda publiczna zwracająca Resolution. Abstrakcyjna baza (AbstractActionBean) — pomijana."""
import re

JEZYK = "java"
ORDER = 15


def DETECT(p):
    return any(k["jezyk"] == "java" and re.search(r"\bActionBean\b", k["implementuje"] + " " + k["rozszerza"]) for k in p.klasy.values()) \
        or "net.sourceforge.stripes" in p.tekst()


def klasyfikuj(k):
    if k["rodzaj"] == "interface": return None
    if re.search(r"\bActionBean\b", k["implementuje"]) or re.search(r"\w*ActionBean\b", k["rozszerza"]) or "UrlBinding" in k["adnotacje"]:
        if k["abstrakcyjna"]:
            return "pomin", "baza ActionBean (Stripes)", "pewne"
        return "wejscie", "ActionBean (Stripes)", "pewne"
    return None
