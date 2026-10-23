"""Spany metod klas z mapy (Python): tylko klasy i metody z mapy, zagnieżdżenie, zamknięcie spanu przy wyjątku. Wymaga opentelemetry-sdk
(bez niego test jest pomijany — w CI flow-lens zależności Pythona nie są instalowane)."""
import json, os, sys, tempfile, threading, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    JEST_OTEL = True
except ImportError:
    JEST_OTEL = False


class Fasada:
    def zloz(self):
        return Polityka().sprawdz() + pomocnik()

class Polityka:
    def sprawdz(self):
        return 1
    def zle(self):
        raise ValueError("x")

def pomocnik():
    return 2


@unittest.skipUnless(JEST_OTEL, "brak opentelemetry-sdk")
class TestMetody(unittest.TestCase):
    def test_spany_tylko_dla_klas_z_mapy_i_zagniezdzone(self):
        eksporter = InMemorySpanExporter()
        dostawca = TracerProvider()
        dostawca.add_span_processor(SimpleSpanProcessor(eksporter))
        trace.set_tracer_provider(dostawca)
        mapa = {"klasy": {f"{__name__}.Fasada": {"rola": "aplikacja", "metody": ["zloz"]},
                          f"{__name__}.Polityka": {"rola": "domena", "metody": ["sprawdz", "zle"]}}}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(mapa, f)
        import flowlens_metody
        try:
            self.assertEqual(flowlens_metody.wlacz(f.name), 2)
            self.assertEqual(Fasada().zloz(), 3)
            with self.assertRaises(ValueError):
                Polityka().zle()
        finally:
            flowlens_metody.wylacz()
        spany = {s.name: s for s in eksporter.get_finished_spans()}
        self.assertEqual(set(spany), {"Fasada.zloz", "Polityka.sprawdz", "Polityka.zle"})
        self.assertEqual(spany["Polityka.sprawdz"].parent.span_id, spany["Fasada.zloz"].context.span_id)
        self.assertEqual(spany["Fasada.zloz"].attributes["code.namespace"], f"{__name__}.Fasada")
        self.assertIsNotNone(spany["Polityka.zle"].end_time)          # wyjątek też zamyka span


if __name__ == "__main__":
    unittest.main()
