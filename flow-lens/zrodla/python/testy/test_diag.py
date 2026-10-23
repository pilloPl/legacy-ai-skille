"""Log diagnostyczny bez OTel (flowlens_diag): metody z mapy, kor przez await i osobno dla równoległych requestów,
wyjątek przy wyjściu, await to nie wyjście.   python3 -m unittest discover -s zrodla/python/testy"""
import asyncio, json, os, subprocess, sys, tempfile, textwrap, unittest

TU = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APKA = textwrap.dedent('''
    import asyncio, flowlens_diag as d
    class Repo:
        def znajdz(self, x): return x
        async def znajdz_a(self, x):
            await asyncio.sleep(0.01)
            return x
    class Serwis:
        def __init__(self): self.r = Repo()
        def zrob(self, x):
            return self.r.znajdz(x)
        def psuj(self):
            raise ValueError("zle")
        async def zrob_a(self, x):
            await asyncio.sleep(0.01)
            return await self.r.znajdz_a(x)
    s = Serwis()
    d.http_start("GET", "/a/1"); s.zrob(1); d.http_koniec("/a/1", 200, "/a/{id}")
    d.http_start("POST", "/b")
    try: s.psuj()
    except ValueError: pass
    d.http_koniec("/b", 500)
    async def req(n):
        d.http_start("GET", f"/c/{n}"); await s.zrob_a(n); d.http_koniec(f"/c/{n}", 200)
    async def main(): await asyncio.gather(req(1), req(2))
    asyncio.run(main())
''')


class TestDiag(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        kat = tempfile.mkdtemp()
        mapa = os.path.join(kat, "mapa.json")
        json.dump({"klasy": {"__main__.Serwis": {"rola": "aplikacja", "metody": ["zrob", "psuj", "zrob_a"]},
                             "__main__.Repo": {"rola": "repozytorium", "metody": ["znajdz", "znajdz_a"]}}}, open(mapa, "w"))
        diag = os.path.join(kat, "diag")
        env = dict(os.environ, PYTHONPATH=TU, FLOWLENS_MAPA=mapa, FLOWLENS_DIAG=diag)
        subprocess.run([sys.executable, "-c", APKA], env=env, check=True)
        cls.z = [json.loads(l) for f in os.listdir(diag) for l in open(os.path.join(diag, f))]

    def kor(self, sciezka):
        return next(z["kor"] for z in self.z if z.get("wejscie", {}).get("sciezka") == sciezka)

    def test_zagniezdzenie_w_jednym_kor_i_szablon_sciezki(self):
        k = self.kor("/a/1")
        zd = [(z["ev"], z["klasa"].split(".")[-1], z["metoda"]) for z in self.z if z["kor"] == k]
        self.assertEqual(zd, [("in", "http", "/a/1"), ("in", "Serwis", "zrob"), ("in", "Repo", "znajdz"), ("out", "Repo", "znajdz"),
                              ("out", "Serwis", "zrob"), ("out", "http", "/a/1")])
        self.assertEqual([z for z in self.z if z["kor"] == k][-1].get("sciezka"), "/a/{id}")

    def test_wyjatek_przy_wyjsciu(self):
        out = next(z for z in self.z if z["kor"] == self.kor("/b") and z["ev"] == "out" and z["metoda"] == "psuj")
        self.assertIn("ValueError: zle", out["blad"])

    def test_await_to_nie_wyjscie_i_rownolegle_requesty_osobno(self):
        for n in (1, 2):
            k = self.kor(f"/c/{n}")
            zd = [(z["ev"], z["metoda"]) for z in self.z if z["kor"] == k]
            self.assertEqual(zd, [("in", f"/c/{n}"), ("in", "zrob_a"), ("in", "znajdz_a"), ("out", "znajdz_a"), ("out", "zrob_a"), ("out", f"/c/{n}")])


if __name__ == "__main__":
    unittest.main()
