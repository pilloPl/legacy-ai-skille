"""Reguły MyBatis (Java): mappery — interfejsy z @Mapper, z pakietu skanowanego (<mybatis:scan base-package>,
@MapperScan) albo z XML <mapper namespace="FQN"> — to dostęp do danych (repozytorium-interfejs), metody = id
instrukcji z XML (select/insert/update/delete). Przed regułą Javy, która nazwę *Mapper bierze za techniczną."""
import os, re

JEZYK = "java"
ORDER = 15
_STAN = {"namespace": {}, "pakiety": set(), "ibatis": set(), "mapstruct": set()}


def DETECT(p):
    ns, pak = {}, set()
    _STAN["ibatis"], _STAN["mapstruct"] = set(), set()
    for d, _, fs in os.walk(p.repo):
        if "/." in d or "/target" in d or "node_modules" in d: continue
        for f in fs:
            if not f.endswith((".xml", ".java")) or f == "pom.xml": continue
            try:
                with open(os.path.join(d, f), encoding="utf-8", errors="replace") as h: t = h.read()
            except OSError: continue
            if f.endswith(".java") and "org.mapstruct" in t: _STAN["mapstruct"].add(os.path.relpath(os.path.join(d, f), p.repo))
            if f.endswith(".xml"):
                m = re.search(r'<mapper\s+namespace="([\w.$]+)"', t)
                if m and "mybatis" in t.lower() or m and "<select" in t:
                    ns[m.group(1)] = re.findall(r'<(?:select|insert|update|delete)\b[^>]*\bid="(\w+)"', t)
                pak |= set(re.findall(r'<mybatis:scan\b[^>]*\bbase-package="([^"]+)"', t))
                pak |= set(re.findall(r'MapperScannerConfigurer.*?name="basePackage"\s+value="([^"]+)"', t, re.S))
            elif "org.apache.ibatis" in t or "org.mybatis" in t:
                _STAN["ibatis"].add(os.path.relpath(os.path.join(d, f), p.repo))
            if f.endswith(".java") and "MapperScan" in t:
                for a in re.findall(r"@MapperScan\s*\(([^)]*)\)", t): pak |= set(re.findall(r'"([\w.]+)"', a))
    _STAN["namespace"], _STAN["pakiety"] = ns, {x.strip() for p_ in pak for x in re.split(r"[,;\s]+", p_) if x.strip()}
    return bool(ns or _STAN["pakiety"] or _STAN["ibatis"])


def klasyfikuj(k):
    if k["rodzaj"] != "interface" or k["plik"] in _STAN["mapstruct"]: return None     # MapStruct: mapper DTO, nie SQL
    w_skanie = any(k["pakiet"] == x or k["pakiet"].startswith(x + ".") for x in _STAN["pakiety"])
    # @Mapper tylko z MyBatis (org.apache.ibatis) — MapStruct ma adnotację o tej samej nazwie
    mapper = "Mapper" in k["adnotacje"] and k["plik"] in _STAN["ibatis"]
    if k["fqn"] in _STAN["namespace"] or mapper or w_skanie:
        ids = _STAN["namespace"].get(k["fqn"])
        k["metody_interfejsu"] = sorted(set(ids)) if ids else sorted({m["nazwa"] for m in k["metody"]})
        return "repozytorium", "mapper MyBatis (" + ("XML namespace" if ids else "@Mapper" if mapper else "skan pakietu") + ")", "pewne"
    return None
