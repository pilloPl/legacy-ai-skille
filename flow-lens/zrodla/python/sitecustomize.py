"""flow-lens (Python): auto-instrumentacja OpenTelemetry (SQL, HTTP, logi) + spany metod klas z mapy,
albo — z FLOWLENS_DIAG=<katalog> — log diagnostyczny bez OpenTelemetry (flowlens_diag.py).

Działa, gdy ten katalog jest na PYTHONPATH i ustawione jest FLOWLENS_MAPA — flow.mjs robi to sam przy
`node flow.mjs -- python …` / `pytest` / `uvicorn` … W środowisku aplikacji muszą być pakiety OTel:
  pip install opentelemetry-distro opentelemetry-exporter-otlp-proto-http && opentelemetry-bootstrap -a install
"""
import os
import sys

if os.environ.get("FLOWLENS_DIAG") and os.environ.get("FLOWLENS_MAPA"):
    # bez OpenTelemetry: nasz log diagnostyczny (metody z mapy, granice HTTP, SQL, transakcje, inne systemy)
    try:
        import flowlens_diag
        ile = flowlens_diag.wlacz(os.environ["FLOWLENS_MAPA"], os.environ["FLOWLENS_DIAG"])
        flowlens_diag.zainstaluj_latki()
        if os.environ.get("FLOWLENS_GADATLIWY"):
            print(f"flow-lens: log diagnostyczny ({ile} klas z mapy) → {os.environ['FLOWLENS_DIAG']}", file=sys.stderr)
    except Exception as e:
        print(f"flow-lens: log diagnostyczny wyłączony ({e})", file=sys.stderr)
elif os.environ.get("FLOWLENS_MAPA"):
    try:
        from opentelemetry.instrumentation.auto_instrumentation import initialize
        initialize()                                       # to samo, co robi `opentelemetry-instrument`
    except Exception as e:                                 # brak pakietów OTel w środowisku aplikacji
        print(f"flow-lens: brak auto-instrumentacji OpenTelemetry ({e}). "
              "Zainstaluj: pip install opentelemetry-distro opentelemetry-exporter-otlp-proto-http && opentelemetry-bootstrap -a install",
              file=sys.stderr)
    else:
        try:
            import flowlens_metody
            flowlens_metody.bez_petli_logow()              # eksporter logów nie eksportuje własnych logów (urllib3 DEBUG)
            ile = flowlens_metody.wlacz(os.environ["FLOWLENS_MAPA"])
            if os.environ.get("FLOWLENS_GADATLIWY"):
                print(f"flow-lens: spany metod dla {ile} klas z mapy", file=sys.stderr)
        except Exception as e:
            print(f"flow-lens: spany metod wyłączone ({e})", file=sys.stderr)
