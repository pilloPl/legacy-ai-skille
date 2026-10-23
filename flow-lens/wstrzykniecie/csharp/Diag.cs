// flow-lens: log diagnostyczny dla .NET (wstrzyknięty tylko do kopii aplikacji, gałąź flowlens-diag).
// Format: zrodla/diag.mjs w skillu flow-lens. Bez zależności — same typy frameworka, reszta przez refleksję.
//
// - Metody klas z mapy: wstrzyknięta linia `using var __flowlens = flowlens.Diag.Metoda("Ns.Klasa", "Metoda");`
//   tworzy Activity ze źródła „flowlens.metody” (async też: using zamyka ją z końcem metody), a filtr
//   `catch … when (Diag.Blad(__flowlens, e))` oznacza ją błędem, gdy wyjątek z metody wychodzi. Z OTel .NET
//   wystarczy OTEL_DOTNET_AUTO_TRACES_ADDITIONAL_SOURCES=flowlens.metody — kroki przez klasy są w śladzie, a granice
//   transakcji EF / TransactionScope jako Activity „BEGIN” / „COMMIT” / „ROLLBACK” z db.statement (Npgsql nie daje
//   spanów BEGIN/COMMIT, więc bez nich ślad OTel kopii nie ma transakcji).
// - Bez OTel (FLOWLENS_DIAG=<katalog>): moduł sam się rejestruje ([ModuleInitializer]) i słucha wszystkich Activity
//   i DiagnosticListener: ASP.NET Core (metoda, ścieżka, status, szablon trasy), EF Core (transakcje, savepointy),
//   Npgsql / SqlClient (SQL — też Dapper i ADO.NET), HttpClient (inne systemy). kor = TraceId, id = SpanId.
// - Rozwiązanie z kilkoma projektami: plik trafia do jednego (najniższego wspólnego, public) albo — gdy go nie ma —
//   do każdego (internal); słucha i pisze tylko pierwszy zainicjowany moduł (strażnik w AppDomain).
// - SQL jeden raz: SqlClient z DiagnosticListener (WriteCommandAfter), z Activity tylko najniższy span bazy
//   (span EF z dzieckiem ADO.NET pomijamy). Rodzic SQL/tx/zew = najbliższa metoda z mapy albo request, nie span
//   instrumentacji OTel (ten nie jest w drzewie).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;

namespace flowlens
{
    public static class Diag
    {
        public static readonly ActivitySource Zrodlo = new ActivitySource("flowlens.metody");

        // tagi od razu w StartActivity: słuchacz (ActivityStarted) widzi je już przy starcie
        public static Activity? Metoda(string klasa, string metoda)
        {
            var a = Zrodlo.StartActivity(klasa.Substring(klasa.LastIndexOf('.') + 1) + "." + metoda, ActivityKind.Internal,
                Activity.Current?.Context ?? default,
                new[] { new KeyValuePair<string, object?>("code.namespace", klasa), new KeyValuePair<string, object?>("code.function", metoda) });
            otoczenie?.Invoke(a);
            return a;
        }

        // filtr wyjątku z wstrzykniętego catch … when: wyjątek wychodzi z metody (także złapany wyżej, w kontrolerze /
        // stronie) — Activity metody z błędem, „blad” w rekordzie out. Zawsze false: nie łapie, stos bez zmian.
        public static bool Blad(Activity? a, Exception e)
        {
            try { if (a != null && a.Status != ActivityStatusCode.Error) a.SetStatus(ActivityStatusCode.Error, e.GetType().FullName + ": " + e.Message); }
            catch { }
            return false;
        }

        // wywołanie z projektu wejściowego (FlowlensStart.cs): moduł z Diag ładuje się dopiero przy pierwszym użyciu
        public static void Uruchom() => Start();

        // TransactionScope (transakcja otoczenia): EF i sterownik nie dają zdarzeń — zauważamy ją przy pierwszej
        // metodzie w jej zasięgu, koniec ze zdarzenia TransactionCompleted (Committed / Aborted)
        static readonly HashSet<string> otoczenia = new HashSet<string>();
        static void Otoczenie(Activity? a)
        {
            try
            {
                var tr = System.Transactions.Transaction.Current;
                if (tr == null || a == null) return;
                var id = tr.TransactionInformation.LocalIdentifier;
                lock (otoczenia) if (!otoczenia.Add(id)) return;
                var kor = a.TraceId; var rodzic = a.ParentSpanId != default ? a.ParentSpanId : a.SpanId;
                Tx(kor, rodzic, "begin", "TransactionScope");
                tr.TransactionCompleted += (s, e) =>
                {
                    var st = e.Transaction?.TransactionInformation.Status;
                    Tx(kor, rodzic, st == System.Transactions.TransactionStatus.Committed ? "commit" : "rollback", "TransactionScope");
                };
            }
            catch { }
        }

        // granica transakcji: zdarzenie „tx” logu diagnostycznego i znacznik dla OTel — Activity „BEGIN” / „COMMIT” /
        // „ROLLBACK” (db.statement) ze źródła flowlens.metody pod najbliższą metodą z mapy albo requestem. Npgsql i EF
        // nie dają tych granic jako spanów (sterownik dokleja BEGIN do następnego polecenia, COMMIT idzie bez Activity),
        // więc bez znacznika ślad OTel kopii nie ma transakcji. Nasz słuchacz Activity znaczniki pomija (jest „tx”).
        static void Tx(ActivityTraceId kor, ActivitySpanId rodzic, string faza, string zrodlo)
        {
            PiszZdarzenie("tx", kor, rodzic, ("faza", faza), ("zrodlo", zrodlo));
            if (kor == default || rodzic == default) return;                         // poza requestem i metodą z mapy
            try
            {
                var sql = faza == "begin" ? "BEGIN" : faza == "commit" ? "COMMIT" : "ROLLBACK";
                using var a = Zrodlo.StartActivity(sql, ActivityKind.Internal, new ActivityContext(kor, rodzic, ActivityTraceFlags.Recorded),
                    new[] { new KeyValuePair<string, object?>("db.statement", sql), new KeyValuePair<string, object?>(ZNACZNIK_TX, zrodlo) });
            }
            catch { }
        }
        const string ZNACZNIK_TX = "flowlens.tx";

        static readonly HashSet<Guid> zakonczone = new HashSet<Guid>();
        static void Koniec(object? p) { if (Prop(p, "TransactionId") is Guid g) lock (zakonczone) zakonczone.Add(g); }

        static readonly string? Katalog = Environment.GetEnvironmentVariable("FLOWLENS_DIAG");
        static StreamWriter? pisarz;
        static Action<Activity?>? otoczenie;
        static int uruchomiony;
        static readonly object blokada = new object();
        static long sek;
        static readonly double T0 = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        static readonly Stopwatch Zegar = Stopwatch.StartNew();
        static double Ts() => Math.Round(T0 + Zegar.Elapsed.TotalMilliseconds, 3);

#pragma warning disable CA2255
        [ModuleInitializer]
#pragma warning restore CA2255
        internal static void Start()
        {
            // bez FLOWLENS_DIAG (sam OTel + metody): bez pliku i słuchacza Activity, tylko zdarzenia transakcji EF i
            // TransactionScope — dla znaczników transakcji w śladzie OTel
            if (Interlocked.Exchange(ref uruchomiony, 1) == 1) return;
            var bezLogu = string.IsNullOrEmpty(Katalog);
            // kilka kopii (po jednej na projekt): słucha i pisze tylko pierwsza, reszta oddaje jej TransactionScope
            lock (string.Intern("flowlens.diag"))
            try
            {
                if (AppDomain.CurrentDomain.GetData("flowlens.diag") is Action<Activity?> wspolny) { otoczenie = wspolny; return; }
                if (!bezLogu)
                {
                    Directory.CreateDirectory(Katalog!);
                    var plik = new FileStream(Path.Combine(Katalog!, Environment.ProcessId + ".jsonl"), FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                    pisarz = new StreamWriter(plik, new UTF8Encoding(false)) { AutoFlush = true };
                    ActivitySource.AddActivityListener(new ActivityListener
                    {
                        ShouldListenTo = s => true,
                        Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
                        ActivityStarted = Rozpoczeta,
                        ActivityStopped = Zakonczona,
                    });
                }
                DiagnosticListener.AllListeners.Subscribe(new Sluchacze(bezLogu));
                otoczenie = Otoczenie;
                AppDomain.CurrentDomain.SetData("flowlens.diag", otoczenie);
            }
            catch { }
        }

        // ---------------------------------------------------------------- Activity: metody z mapy, SQL, HTTP
        static void Rozpoczeta(Activity a)
        {
            if (a.Source.Name != "flowlens.metody" || a.GetTagItem(ZNACZNIK_TX) != null) return;
            var root = a.ParentSpanId == default;
            Pisz("in", a, a.ParentSpanId, new[] {
                ("klasa", Tag(a, "code.namespace")), ("metoda", Tag(a, "code.function")) },
                root ? "{\"rodzaj\":\"" + (Thread.CurrentThread.IsBackground ? "w tle" : "wywolanie") + "\",\"nazwa\":" + Str(a.DisplayName) + "}" : null);
        }

        static void Zakonczona(Activity a)
        {
            if (a.GetTagItem(ZNACZNIK_TX) != null) return;
            if (a.Source.Name == "flowlens.metody")
            {
                Pisz("out", a, a.ParentSpanId, new[] { ("klasa", Tag(a, "code.namespace")), ("metoda", Tag(a, "code.function")),
                    ("blad", a.Status == ActivityStatusCode.Error ? a.StatusDescription : null) }, null);
                return;
            }
            var sql = Sql(a);
            if (sql == null) return;
            var zastapiony = false;
            lock (zastapione) zastapiony = zastapione.Remove(a.SpanId);
            OznaczPrzodkow(a.Parent);
            // SqlClient: SQL z DiagnosticListener (tekst z literałami); span OTel SqlClient byłby drugą kopią
            if (zastapiony || ZSqlClient(a)) return;
            PiszZdarzenie("sql", a.TraceId, Wezel(a.Parent, a.ParentSpanId), ("sql", sql), ("ms", Ms(a.Duration.TotalMilliseconds)));
        }

        // span bazy (Npgsql, ADO.NET, EF, SqlClient z OTel): Client z tekstem polecenia
        static string? Sql(Activity? a) => a == null || a.Kind != ActivityKind.Client ? null : Tag(a, "db.statement") ?? Tag(a, "db.query.text");
        static bool ZSqlClient(Activity a) => a.Source.Name.Contains("SqlClient")
            || Tag(a, "db.system") == "mssql" || Tag(a, "db.system.name") == "microsoft.sql_server";

        // spany bazy nad zapisanym SQL (EF nad ADO.NET, SqlClient nad WriteCommandAfter) — przy ich końcu już bez SQL
        static readonly HashSet<ActivitySpanId> zastapione = new HashSet<ActivitySpanId>();
        static void OznaczPrzodkow(Activity? a)
        {
            for (; a != null && Sql(a) != null; a = a.Parent)
                if (a.Duration == TimeSpan.Zero) lock (zastapione) zastapione.Add(a.SpanId);     // jeszcze trwa
        }

        // rodzic w drzewie: najbliższa metoda z mapy albo request ASP.NET Core (spany instrumentacji OTel pomijamy)
        static ActivitySpanId Wezel(Activity? a, ActivitySpanId zapas = default)
        {
            for (var x = a; x != null; x = x.Parent)
                if (x.Source.Name == "flowlens.metody" || x.OperationName == "Microsoft.AspNetCore.Hosting.HttpRequestIn") return x.SpanId;
            return zapas;
        }

        static string Ms(double ms) => ms.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);

        // ---------------------------------------------------------------- DiagnosticListener: HTTP, EF, SqlClient
        sealed class Sluchacze : IObserver<DiagnosticListener>
        {
            readonly bool tylkoEf;
            public Sluchacze(bool tylkoEf) { this.tylkoEf = tylkoEf; }
            public void OnNext(DiagnosticListener l)
            {
                if (tylkoEf ? l.Name == "Microsoft.EntityFrameworkCore" : l.Name is "Microsoft.AspNetCore" or "Microsoft.EntityFrameworkCore" or "HttpHandlerDiagnosticListener" or "SqlClientDiagnosticListener")
                    l.Subscribe(new Zdarzenia(l.Name));
            }
            public void OnError(Exception e) { }
            public void OnCompleted() { }
        }

        sealed class Zdarzenia : IObserver<KeyValuePair<string, object?>>
        {
            readonly string zrodlo;
            public Zdarzenia(string z) { zrodlo = z; }
            public void OnError(Exception e) { }
            public void OnCompleted() { }
            public void OnNext(KeyValuePair<string, object?> z)
            {
                try { Obsluz(zrodlo, z.Key, z.Value); } catch { }
            }
        }

        static void Obsluz(string zrodlo, string nazwa, object? p)
        {
            var a = Activity.Current;
            var kor = a?.TraceId ?? default;
            var wezel = Wezel(a, a?.SpanId ?? default);
            switch (nazwa)
            {
                case "Microsoft.AspNetCore.Hosting.HttpRequestIn.Start":
                {
                    var req = Prop(p, "Request");
                    var metoda = Prop(req, "Method")?.ToString() ?? "GET";
                    var sciezka = Prop(req, "Path")?.ToString() ?? "/";
                    if (a != null) Pisz("in", a, default, new (string, string?)[] { ("klasa", "http"), ("metoda", sciezka) },
                        "{\"rodzaj\":\"http\",\"metoda\":" + Str(metoda) + ",\"sciezka\":" + Str(sciezka) + ",\"nazwa\":" + Str(metoda + " " + sciezka) + "}");
                    break;
                }
                case "Microsoft.AspNetCore.Hosting.HttpRequestIn.Stop":
                {
                    var status = Prop(Prop(p, "Response"), "StatusCode")?.ToString() ?? "0";
                    var sciezka = Prop(Prop(p, "Request"), "Path")?.ToString() ?? "/";
                    if (a != null) Pisz("out", a, default, new[] { ("klasa", "http"), ("metoda", sciezka), ("sciezka", Szablon(p)) }, null, status);
                    break;
                }
                case "Microsoft.AspNetCore.Diagnostics.UnhandledException":
                case "Microsoft.AspNetCore.Hosting.UnhandledException":
                    break;
                case "Microsoft.EntityFrameworkCore.Database.Transaction.TransactionStarted":
                    Tx(kor, wezel, "begin", "efcore"); break;
                case "Microsoft.EntityFrameworkCore.Database.Transaction.TransactionCommitted":
                    Koniec(p); Tx(kor, wezel, "commit", "efcore"); break;
                case "Microsoft.EntityFrameworkCore.Database.Transaction.TransactionRolledBack":
                    Koniec(p); Tx(kor, wezel, "rollback", "efcore"); break;
                case "Microsoft.EntityFrameworkCore.Database.Transaction.TransactionDisposed":
                {
                    // Dispose bez Commit/Rollback (wyjątek w using) = rollback po stronie bazy
                    var zamknieta = Prop(p, "TransactionId") is Guid g && !zakonczone.Remove(g);
                    if (zamknieta) Tx(kor, wezel, "rollback", "efcore-dispose");
                    break;
                }
                case "Microsoft.EntityFrameworkCore.Database.Transaction.CreatedSavepoint":
                    PiszZdarzenie("sql", kor, wezel, ("sql", "SAVEPOINT " + Prop(p, "Name"))); break;
                case "Microsoft.EntityFrameworkCore.Database.Transaction.ReleasedSavepoint":
                    PiszZdarzenie("sql", kor, wezel, ("sql", "RELEASE SAVEPOINT " + Prop(p, "Name"))); break;
                case "Microsoft.EntityFrameworkCore.Database.Transaction.RolledBackToSavepoint":
                    PiszZdarzenie("sql", kor, wezel, ("sql", "ROLLBACK TO SAVEPOINT " + Prop(p, "Name"))); break;
                case "System.Net.Http.HttpRequestOut.Stop":
                {
                    var req = Prop(p, "Request");
                    var url = Prop(req, "RequestUri")?.ToString();
                    if (url != null && Eksport.IsMatch(url)) break;                   // eksporter OTLP, nie inny system aplikacji
                    PiszZdarzenie("zew", kor, Wezel(a?.Parent, a?.ParentSpanId ?? default), ("metoda", Prop(req, "Method")?.ToString()), ("url", url));
                    break;
                }
                case "Microsoft.Data.SqlClient.WriteCommandBefore":
                case "System.Data.SqlClient.WriteCommandBefore":
                    // System.Data.SqlClient (Dapper, ADO.NET) nie ma Timestamp w Before — wtedy własny odczyt zegara
                    if (Prop(p, "OperationId") is Guid op) lock (poczatki) poczatki[op] = Prop(p, "Timestamp") is long tp ? tp : Stopwatch.GetTimestamp();
                    break;
                case "Microsoft.Data.SqlClient.WriteCommandAfter":
                case "System.Data.SqlClient.WriteCommandAfter":
                    SqlKoniec(p, a, kor, wezel, null);
                    break;
                case "Microsoft.Data.SqlClient.WriteCommandError":
                case "System.Data.SqlClient.WriteCommandError":
                {
                    // nieudane polecenie też jest krokiem SQL (z błędem) — inaczej znika z przebiegu
                    var e = Prop(p, "Exception") as Exception;
                    SqlKoniec(p, a, kor, wezel, e == null ? "błąd SQL" : e.GetType().FullName + ": " + e.Message);
                    break;
                }
            }
        }

        static void SqlKoniec(object? p, Activity? a, ActivityTraceId kor, ActivitySpanId wezel, string? blad)
        {
            // Activity.Current to tu span OTel SqlClient / EF (gdy działa OTel) — jego SQL już nie piszemy
            OznaczPrzodkow(a);
            string? ms = null;
            if (Prop(p, "OperationId") is Guid op)
            {
                var t1 = Prop(p, "Timestamp") is long t ? t : Stopwatch.GetTimestamp();
                lock (poczatki) if (poczatki.Remove(op, out var t0)) ms = Ms((t1 - t0) * 1000.0 / Stopwatch.Frequency);
            }
            PiszZdarzenie("sql", kor, wezel, ("sql", Prop(Prop(p, "Command"), "CommandText")?.ToString()), ("ms", ms), ("blad", blad));
        }

        static readonly Dictionary<Guid, long> poczatki = new Dictionary<Guid, long>();
        static readonly System.Text.RegularExpressions.Regex Eksport = new System.Text.RegularExpressions.Regex(@"/v1/(traces|metrics|logs)/?(\?|$)");

        // szablon trasy (RouteEndpoint.RoutePattern.RawText) z cech HttpContext — bez referencji do ASP.NET Core.
        // Endpoint bierzemy z typu cechy (IEndpointFeature), nie z typu wartości: Kestrel implementuje go jawnie.
        static string? Szablon(object? ctx)
        {
            try
            {
                if (Prop(ctx, "Features") is System.Collections.IEnumerable cechy)
                    foreach (var c in cechy)
                    {
                        var typ = Prop(c, "Key") as Type;
                        if (typ?.Name != "IEndpointFeature") continue;
                        var endpoint = typ.GetProperty("Endpoint")?.GetValue(Prop(c, "Value"));
                        var t = Prop(Prop(endpoint, "RoutePattern"), "RawText")?.ToString();
                        return t == null ? null : "/" + t.TrimStart('/');
                    }
            }
            catch { }
            return null;
        }

        // ---------------------------------------------------------------- zapis
        static void Pisz(string ev, Activity a, ActivitySpanId rodzic, (string, string?)[] pola, string? wejscie, string? status = null)
        {
            var s = Naglowek(ev, a.TraceId).Append(",\"id\":").Append(Str(a.SpanId.ToString()));
            if (rodzic != default) s.Append(",\"rodzic\":").Append(Str(rodzic.ToString()));
            foreach (var (k, v) in pola) if (v != null) s.Append(",\"").Append(k).Append("\":").Append(Str(v));
            if (wejscie != null) s.Append(",\"wejscie\":").Append(wejscie);
            if (status != null) s.Append(",\"status\":").Append(status);
            Zapisz(s.Append('}'));
        }

        static void PiszZdarzenie(string ev, ActivityTraceId kor, ActivitySpanId rodzic, params (string, string?)[] pola)
        {
            var s = Naglowek(ev, kor);
            if (rodzic != default) s.Append(",\"rodzic\":").Append(Str(rodzic.ToString()));
            foreach (var (k, v) in pola) if (v != null) s.Append(",\"").Append(k).Append("\":").Append(k == "ms" ? v : Str(v));
            Zapisz(s.Append('}'));
        }

        static StringBuilder Naglowek(string ev, ActivityTraceId kor) => new StringBuilder("{\"v\":1,\"ts\":")
            .Append(Ts().ToString("0.###", System.Globalization.CultureInfo.InvariantCulture))
            .Append(",\"pid\":").Append(Environment.ProcessId)
            .Append(",\"w\":").Append(Str(Thread.CurrentThread.Name ?? ("w" + Environment.CurrentManagedThreadId)))
            .Append(",\"kor\":").Append(kor == default ? "null" : Str(kor.ToString()))
            .Append(",\"sek\":").Append(Interlocked.Increment(ref sek))
            .Append(",\"ev\":\"").Append(ev).Append('"');

        static void Zapisz(StringBuilder s)
        {
            try { lock (blokada) pisarz?.WriteLine(s.ToString()); } catch { }
        }

        static string? Tag(Activity a, string k) => a.GetTagItem(k)?.ToString();
        static object? Prop(object? o, string n) => o?.GetType().GetProperty(n)?.GetValue(o);

        static string Str(string? t)
        {
            if (t == null) return "null";
            var s = new StringBuilder("\"");
            foreach (var c in t)
                switch (c)
                {
                    case '"': s.Append("\\\""); break;
                    case '\\': s.Append("\\\\"); break;
                    case '\n': s.Append("\\n"); break;
                    case '\r': s.Append("\\r"); break;
                    case '\t': s.Append("\\t"); break;
                    default: if (c < 0x20) s.Append("\\u").Append(((int)c).ToString("x4")); else s.Append(c); break;
                }
            return s.Append('"').ToString();
        }
    }
}
