# Katalog wiedzy flow-lens: Java / JVM

Źródło danych: `java.json` (pełne pola, źródła i wersje). Ten plik to czytelne podsumowanie.

| Temat | Wpisy | Wyjątki |
|---|---|---|
| Wejścia | 23 | 87 |
| Dostęp do danych | 22 | 78 |
| Transakcje | 22 | 71 |
| Logi | 19 | 80 |
| Wstrzykiwanie | 23 | 127 |
| **Razem** | **109** | **443** |

## Wejścia

### Mechanizmy

| Nazwa | Jak rozpoznać statycznie | W logu | W OTel | Wstrzyknięcie |
|---|---|---|---|---|
| Spring Web MVC: @Controller/@RestController i inne HandlerMapping | Klasa z @Controller/@RestController (isHandler(): @Controller na typie) + metody z @RequestMapping lub @GetMapping/@PostMapping/@PutMapping/@DeleteMapping/@PatchMapping. Szukać przez meta-adnotacje (MergedAnnotations), bo bywają własne adnotacje typu @ApiGet. Adnotacje mogą być na INTERFEJSIE implementowanym przez kontroler (wspólne API z klientem Feign/z generatora OpenAPI). Od 6.1 @HttpExchange/@GetExchange na interfejsie implementowanym przez @Controller też tworzy endpoint. Funkcyjnie: bean RouterFunction<ServerResponse> z RouterFunctions.route().GET("/x", handler::m). XML: <bean class="...SimpleUrlHandlerMapping"><property name="mappings">, <mvc:view-controller path>, bean o nazwie zaczynającej się od '/', MultiActionController + methodNameResolver (InternalPathMethodNameResolver / ParameterMethodNameResolver / PropertiesMethodNameResolver). | logging.level.web=DEBUG (grupa Boot: org.springframework.core.codec, org.springframework.http, org.springframework.web, org.springframework.boot.actuate.endpoint.web, org.springframework.boot.web.servlet.ServletContextInitializerBeans). Logger org.springframework.web.servlet.DispatcherServlet DEBUG (5.1+): wiadomość = ["<TYP>" dispatch for ]<METHOD> "<uri>[?query]", parameters={<params>} — params = '' gdy brak, 'masked' gdy są parametry a log-request-details=false, 'multipart' dla multipart; na TRACE dochodzi ', headers={...}'. Regex: '^("(ASYNC\|ERROR\|FORWARD\|INCLUDE)" dispatch for )?([A-Z]+) "([^"]+)", parameters=\{(.*?)\}(, headers=\{.*\})?$'. Wyjście (FrameworkServlet DEBUG): 'Completed 200 OK' (dla dispatchu REQUEST), 'Exiting from "ERROR" dispatch, status 500' (dla innych typów), 'Exiting but response remains open for further handling' (async), 'Failed to complete request: <wyjątek>'. Logger org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping DEBUG 'Mapped to com.acme.UserController#getUser(Long)' (AbstractHandlerMapping; dla ASYNC tylko na TRACE). Przy starcie '_org.springframework.web.servlet.HandlerMapping.Mappings' DEBUG wypisuje tabelę mapowań per kontroler. spring.mvc.log-request-details=true odmaskowuje parametry (nagłówki tylko na TRACE). | Agent: server span z instrumentacji servlet/tomcat, nazwa nadpisywana przez spring-webmvc na '{METHOD} {http.route}', np. 'GET /users/{id}'; atrybuty http.request.method, http.route, url.path, url.query, http.response.status_code, client.address. Span kontrolera INTERNAL 'UserController.getUser' tylko przy otel.instrumentation.common.experimental.controller-telemetry.enabled=true (od agenta 2.0 domyślnie false); widoki: view-telemetry.enabled. Bez agenta (Boot 3 + Micrometer Observation): obserwacja 'http.server.requests', contextual name 'http get /users/{id}'. | Bez zmian w kodzie: poziomy logów jw. (application.properties / LOGGING_LEVEL_WEB=DEBUG) albo javaagent OTel z controller-telemetry. Ze zmianą: OncePerRequestFilter z najwyższym @Order, który czyta/nadaje X-Request-Id, wkłada do MDC i loguje 'ENTRY http GET /users/{id}' (OncePerRequestFilter domyślnie pomija dispatch ASYNC/ERROR — to pomaga w scalaniu); HandlerInterceptor.preHandle (ma HandlerMethod → klasa#metoda) do znacznika z nazwą handlera; @Aspect na @within(RestController). |
| Servlet / Filter / web.xml / JSP i access log kontenera | WEB-INF/web.xml: <servlet><servlet-class>/<jsp-file>, <servlet-mapping><url-pattern>, <filter>/<filter-mapping>, <listener>, <welcome-file-list>; web-fragment.xml w jarach; adnotacje @WebServlet(urlPatterns), @WebFilter, @WebListener; klasy extends HttpServlet (doGet/doPost/service); pliki *.jsp poza WEB-INF (dostępne bezpośrednio z URL); Spring Boot: ServletRegistrationBean / FilterRegistrationBean / @ServletComponentScan; ServletContainerInitializer / WebApplicationInitializer (programowa rejestracja). | Tomcat w Spring Boot: server.tomcat.accesslog.enabled=true, server.tomcat.accesslog.pattern='%h %t "%r" %s %b %D %{X-Request-Id}i %{traceparent}i' (%{Nagłówek}i = nagłówek requestu, %{Nagłówek}o = odpowiedzi; %D = czas w MIKROsekundach w Tomcat 10+, w milisekundach w Tomcat <=9; %T sekundy; w Tomcat 10 %{ms}T daje ms), server.tomcat.accesslog.directory/prefix. Jetty: server.jetty.accesslog.enabled. Undertow: server.undertow.accesslog.enabled + pattern. Standalone Tomcat: valve org.apache.catalina.valves.AccessLogValve w server.xml. Regex dla 'common': '^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]+" (\d{3}) (\S+)'. | Server span z instrumentacji servlet/tomcat/jetty/undertow; bez frameworka routingu nazwa '{METHOD}' albo '{METHOD} {http.route}' z wzorca mapowania servletu (np. 'GET /legacy/*'); atrybuty url.path, http.request.method, http.response.status_code, server.address, client.address. JSP (tylko 2.3.x): spany 'Compile /x.jsp' i 'Render /x.jsp'. | Bez zmian w kodzie: access log z nagłówkiem korelacji w patternie; reverse proxy (nginx $request_id) może nadawać X-Request-Id, który access log i aplikacja odczytują. Ze zmianą: pierwszy Filter w łańcuchu (FilterRegistrationBean z Ordered.HIGHEST_PRECEDENCE albo pierwszy <filter-mapping> w web.xml) — generuje/odczytuje X-Request-Id, MDC.put("requestId"), ustawia nagłówek odpowiedzi, w finally MDC.remove (wątki puli są reużywane). |
| Spring WebFlux: adnotacje + RouterFunction, log prefix wymiany | Zależność spring-boot-starter-webflux; @RestController z typami Mono/Flux; beany RouterFunction (RouterFunctions.route()); WebFilter / HandlerFilterFunction; @EnableWebFlux. | Logger org.springframework.web.server.adapter.HttpWebHandlerAdapter DEBUG: wejście '[7f2e1c3a-1] HTTP GET "/users/7"' (format 'HTTP ' + metoda + ' "' + path + query + '"'), wyjście '[7f2e1c3a-1] Completed 200 OK' (status null → '200 OK'); błąd ERROR '[prefix] 500 Server Error for HTTP GET "/x"'. Regex: '^\[([0-9a-f]+-\d+)\] (HTTP \w+ "[^"]+"\|Completed .*)'. Prefix z ServerWebExchange.getLogPrefix() (z Reactor Netty: ID połączenia + licznik requestów) to gotowy ID korelacji logów frameworka. Mapowanie: org.springframework.web.reactive.result.method.annotation.RequestMappingHandlerMapping DEBUG '[prefix] Mapped to ...'. Włączenie: logging.level.org.springframework.web=DEBUG; szczegóły: spring.codec.log-request-details=true; access log Reactor Netty: -Dreactor.netty.http.server.accessLogEnabled=true (logger reactor.netty.http.server.AccessLog). | Server span z instrumentacji reactor-netty/spring-webflux, nazwa '{METHOD} {http.route}'; przy controller-telemetry span INTERNAL 'UserController.getUser'. Kontekst OTel propagowany przez instrumentację reactor (agent), więc trace jest spójny mimo zmiany wątków. Bez agenta: Micrometer 'http.server.requests'. | Bez zmian: DEBUG jw. — prefix już koreluje logi frameworka. Ze zmianą: WebFilter ustawiający ID w Reactor Context (contextWrite) i atrybut wymiany; w Boot 3.2+ spring.reactor.context-propagation=auto + Micrometer Tracing przenosi traceId/spanId do MDC; dla własnego klucza MDC trzeba zarejestrować ThreadLocalAccessor w ContextRegistry (io.micrometer:context-propagation) albo ręcznie Hooks.enableAutomaticContextPropagation(). |
| JAX-RS (Jersey, RESTEasy, CXF, Quarkus REST) | @Path na klasie/metodzie + @GET/@POST/@PUT/@DELETE/@PATCH/@HEAD/@OPTIONS (lub własna adnotacja z @HttpMethod); @ApplicationPath na subklasie Application; Jersey: ResourceConfig.packages(...), web.xml <param-name>jersey.config.server.provider.packages</param-name>; RESTEasy: resteasy.scan / resteasy.resources; CXF: <jaxrs:server address><jaxrs:serviceBeans>. Sub-resource locator = metoda z @Path BEZ metody HTTP, zwracająca obiekt kolejnego zasobu. Filtry: @Provider + ContainerRequestFilter (@PreMatching). | Jersey: new LoggingFeature(logger, Level.INFO, Verbosity.HEADERS_ONLY, ...) albo properties jersey.config.server.logging.logger.level / jersey.config.server.logging.verbosity (LoggingFeature jest auto-discoverable od Jersey 2.23 — ustawienie property ją włącza); domyślny logger org.glassfish.jersey.logging.LoggingFeature na poziomie FINE (trzeba podnieść albo mostkować JUL→SLF4J); linie '1 * Server has received a request on thread ...' / '1 > GET http://.../users/7' / '1 < 200' (numer = ID requestu w Jersey). RESTEasy: logger org.jboss.resteasy na DEBUG. CXF: LoggingFeature (org.apache.cxf.ext.logging) — wpisy REQ_IN/RESP_OUT z ExchangeId. | Instrumentacja jaxrs ustawia http.route z sumy @ApplicationPath + @Path (server span 'GET /api/users/{id}'); spany 'UserResource.get' tylko przy controller-telemetry.enabled=true. Quarkus: rozszerzenie quarkus-opentelemetry (w native agent nie działa), ta sama konwencja nazw HTTP. | Bez zmian: LoggingFeature przez konfigurację (Jersey properties / CXF <cxf:bus><cxf:features><bean class="org.apache.cxf.ext.logging.LoggingFeature"/>). Ze zmianą: @Provider @PreMatching ContainerRequestFilter + ContainerResponseFilter z MDC i X-Request-Id; ResourceInfo (@Context) daje klasę i metodę zasobu w filtrze po dopasowaniu (bez @PreMatching). |
| SOAP: JAX-WS (@WebService, CXF, Metro, Axis2) i Spring-WS (@Endpoint) | JAX-WS: @WebService (serviceName, portName, endpointInterface), @WebMethod(operationName, action), @SOAPBinding; klasy implementujące SEI wygenerowany z WSDL (wsimport/cxf-codegen); WEB-INF/sun-jaxws.xml <endpoint implementation url-pattern>; CXF: <jaxws:endpoint implementor="#bean" address="/Orders"> w cxf-servlet.xml / beans.xml, EndpointImpl w @Configuration; Endpoint.publish(...); EJB z @WebService (@Stateless); Axis2: services.xml w .aar. Spring-WS: @Endpoint + @PayloadRoot(namespace, localPart) / @SoapAction / @Action, MessageDispatcherServlet, <sws:annotation-driven/>, PayloadRootQNameEndpointMapping w XML. | Spring-WS: loggery org.springframework.ws.server.MessageTracing.received (DEBUG 'Received request [<obiekt wiadomości>]', TRACE 'Received request [<pełna treść>]') i org.springframework.ws.server.MessageTracing.sent (DEBUG 'Sent response [...] for request [...]'). CXF nowy (org.apache.cxf.ext.logging.LoggingFeature, 3.1+): logger 'org.apache.cxf.services.<lokalna nazwa PortType>.<typ zdarzenia>', np. org.apache.cxf.services.OrderPortType.REQ_IN / RESP_OUT; pola ExchangeId, Address, ServiceName, PortName, PortTypeName, Payload. CXF stary (org.apache.cxf.interceptor.LoggingInInterceptor, przestarzały): logger 'org.apache.cxf.services.<Service>.<Port>.<PortType>', blok 'Inbound Message ... ID: 1'. Metro: -Dcom.sun.xml.ws.transport.http.HttpAdapter.dump=true (zrzut na stdout). | CXF (zweryfikowane w CxfRequest/CxfServerSpanNaming): nazwa server spanu = [context path] + [servlet path] + '/' + <lokalna nazwa usługi> + '/' + <operacja>, np. '/app/services/OrderService/placeOrder' (bez metody HTTP); gdy brak BindingOperationInfo — sama nazwa usługi albo 'jaxws'. Metro/Axis2 — analogiczny updater nazwy (format do sprawdzenia). Span INTERNAL 'OrderServiceImpl.placeOrder' (jaxws-2.0, jaxws-jws-api-1.1, spring-ws) tylko przy controller-telemetry.enabled=true. | Bez zmian: LoggingFeature w XML CXF, poziomy MessageTracing w Spring-WS, flagi dump Metro. Ze zmianą: JAX-WS SOAPHandler/LogicalHandler (@HandlerChain), CXF Interceptor (Phase.PRE_INVOKE) czytający QName operacji z Exchange (BindingOperationInfo); Spring-WS EndpointInterceptor.handleRequest (ma obiekt endpointu → klasa#metoda). ID korelacji: nagłówek HTTP lub SOAP Header (WS-Addressing MessageID). |
| gRPC (grpc-java, grpc-spring-boot-starter, Spring gRPC, Quarkus) | extends *Grpc.*ImplBase / implements *Grpc.AsyncService / BindableService; ServerBuilder.forPort(..).addService(new X()); @GrpcService z net.devh.boot.grpc.server.service lub org.springframework.grpc.server.service (Spring gRPC: wystarczy też bean BindableService) lub io.quarkus.grpc.GrpcService; pliki .proto (service X { rpc Y(...) }) dają listę wejść niezależnie od kodu; ServerInterceptor (@GrpcGlobalServerInterceptor). | Brak domyślnego logu wejścia w grpc-java (io.grpc.netty.NettyServerHandler na FINE loguje ramki HTTP/2 — za głęboko). Starter net.devh: przy starcie INFO (domyślnie widoczne) z net.devh.boot.grpc.server.serverfactory.AbstractGrpcServerFactory 'Registered gRPC service: <nazwa>, bean: <bean>, class: <klasa>' — inwentarz wejść w runtime; DEBUG net.devh.boot.grpc pokazuje odkrywanie beanów. | Server span 'pakiet.Usługa/Metoda' (GrpcSpanNameExtractor = MethodDescriptor.getFullMethodName()), SpanKind SERVER, atrybuty rpc.system=grpc, rpc.service, rpc.method, rpc.grpc.status_code (nowsza wersja semconv RPC zmienia nazwy — przypiąć do wersji agenta); zdarzenia 'message' dla wiadomości strumienia (otel.instrumentation.grpc.emit-message-events). | Ze zmianą: globalny ServerInterceptor — w interceptCall czyta Metadata.Key 'x-request-id' (ASCII_STRING_MARSHALLER), nadaje gdy brak, loguje call.getMethodDescriptor().getFullMethodName(), wkłada do io.grpc.Context i MDC. MDC ustawiać w każdym callbacku Listenera (onMessage/onHalfClose/onComplete), bo mogą być na innym wątku. Bez zmian: javaagent OTel. |
| Konsumenci Kafka: @KafkaListener, kontenery programowe, Spring Cloud Stream, Kafka Streams | @KafkaListener(topics/topicPattern/topicPartitions, groupId, containerFactory) na metodzie albo na klasie + @KafkaHandler (dispatch po typie payloadu); @RetryableTopic (dodatkowe kontenery '<topic>-retry-N' i '<topic>-dlt', @DltHandler); programowo: ConcurrentMessageListenerContainer/KafkaMessageListenerContainer + ContainerProperties.setMessageListener(MessageListener/AcknowledgingMessageListener/BatchMessageListener); Spring Cloud Stream funkcyjnie: bean Consumer<T>/Function<T,R> + spring.cloud.function.definition + spring.cloud.stream.bindings.<fn>-in-0.destination=topic — BEZ adnotacji; stary @StreamListener/@EnableBinding; surowa pętla consumer.poll(); Kafka Streams: StreamsBuilder.stream("topic") w @Bean / @EnableKafkaStreams. | Logger org.springframework.kafka.listener.KafkaMessageListenerContainer (nazwa klasy, bez sufiksu; ID kontenera jest w nazwie wątku, np. 'org.springframework.kafka.KafkaListenerEndpointContainer#0-0-C-1') DEBUG 'Received: 3 records', TRACE 'Processing orders-0@42' (KafkaUtils.format: topic-partycja@offset). Włączenie: logging.level.org.springframework.kafka.listener=TRACE. Błędy: DefaultErrorHandler / SeekUtils loguje rekord, który się nie powiódł. Klient: ConsumerCoordinator INFO o przypisaniu partycji (nie per rekord). | Agent (kafka-clients, spring-kafka-2.7), domyślna (legacy) konwencja: span CONSUMER '<topic> process' (przy receive-telemetry dodatkowo '<topic> receive'); przy otel.semconv-stability.opt-in=messaging (stabilna konwencja, w agencie 2.32 opcjonalna, na main już domyślna) kolejność odwrócona: 'process <topic>'. Atrybuty messaging.system=kafka, messaging.destination.name, messaging.operation, messaging.kafka.consumer.group / messaging.consumer.group.name (zależnie od semconv), messaging.kafka.message.offset, messaging.destination.partition.id; parent = producer z nagłówka traceparent. Listener batch: jeden span process z linkami. Micrometer Observation Spring Kafka (bez agenta): KafkaListenerObservation, tagi spring.kafka.listener.id, messaging.system, messaging.operation, messaging.source.name, messaging.source.kind, messaging.kafka.consumer.group. | Bez zmian: TRACE kontenera (topic-partycja@offset to naturalny ID wejścia); javaagent OTel. Ze zmianą: RecordInterceptor/BatchInterceptor (factory.setRecordInterceptor) — intercept() czyta nagłówek correlation-id z ConsumerRecord.headers(), MDC.put, afterRecord czyści MDC; po stronie producenta ProducerInterceptor dokłada nagłówek. Spring Cloud Stream: Function<Message<T>,...> z nagłówkami. |
| JMS / RabbitMQ / MDB: listenery kolejek | @JmsListener(destination), @RabbitListener(queues/bindings) (+ @RabbitHandler na klasie), @EnableJms/@EnableRabbit; XML: <jms:listener-container><jms:listener destination ref method/>, <rabbit:listener-container><rabbit:listener queues ref method/>, bean DefaultMessageListenerContainer/SimpleMessageListenerContainer z property messageListener; MessageListenerAdapter z defaultListenerMethod (POJO bez interfejsu); MDB: @MessageDriven(activationConfig = @ActivationConfigProperty(propertyName="destinationLookup"/"destination", ...)) implements MessageListener.onMessage, albo ejb-jar.xml <message-driven><ejb-class> + deskryptory serwera (jboss-ejb3.xml, weblogic-ejb-jar.xml, ibm-ejb-jar-bnd.xml). | Spring JMS (AbstractPollingMessageListenerContainer, logger = klasa kontenera, np. org.springframework.jms.listener.DefaultMessageListenerContainer) DEBUG 'Received message of type [<klasa>] from consumer [...] of transactional session [...]', przy wyjątku DEBUG 'Rolling back transaction because of listener exception thrown: ...'; AbstractMessageListenerContainer DEBUG 'Initiating transaction rollback on application exception' / 'on listener exception'; TRACE '... did not receive a message' (puste odpytywania). Spring AMQP: logging.level.org.springframework.amqp=DEBUG pokazuje odbiór/ack/rollback (dokładne teksty do weryfikacji w wersji). Serwery aplikacyjne logują deploy MDB (np. WildFly WFLYEJB...). | Agent: span CONSUMER '<kolejka/topic> process' (legacy semconv; stable: 'process <kolejka>') dla jms, spring-jms, rabbitmq, spring-rabbit; atrybuty messaging.system=jms\|rabbitmq, messaging.destination.name, messaging.message.id, messaging.rabbitmq.destination.routing_key; propagacja przez właściwości wiadomości JMS / nagłówki AMQP. MDB widać przez span JMS (instrumentacja MessageListener.onMessage), brak instrumentacji EJB jako takiej. Micrometer: Spring AMQP RabbitListenerObservation contextual name '<źródło> receive' (inne słowo niż agent), tagi spring.rabbit.listener.id, messaging.destination.name, wysokiej kardynalności messaging.rabbitmq.message.delivery_tag; Spring JMS — DefaultJmsProcessObservationConvention: nazwa 'jms.message.process', contextual name '<destynacja> process'. | Bez zmian: DEBUG kontenerów, javaagent. Ze zmianą: Spring AMQP — advice chain (factory.setAdviceChain) lub setAfterReceivePostProcessors z MDC z correlationId (natywne pole AMQP); Spring JMS — opakowanie MessageListener/ErrorHandler albo @Aspect na @JmsListener; MDB — @Interceptors / @AroundInvoke czytający Message.getJMSCorrelationID(). |
| Spring @Scheduled / TaskScheduler / XML task:scheduled-tasks | @Scheduled(cron/fixedRate/fixedDelay/initialDelay, zone; wartości często z ${...}) + @EnableScheduling lub <task:annotation-driven/>; @Schedules; XML <task:scheduled-tasks scheduler="s"><task:scheduled ref="bean" method="run" cron="..."/>; SchedulingConfigurer → ScheduledTaskRegistrar.addCronTask/addFixedRateTask; TaskScheduler/ThreadPoolTaskScheduler.schedule(Runnable, Trigger); ShedLock @SchedulerLock(name) obok @Scheduled. | Spring nie loguje pojedynczych wykonań; przy starcie ScheduledAnnotationBeanPostProcessor TRACE ('No @Scheduled annotations found on bean class', liczba przetworzonych metod @Scheduled). Błędy: logger org.springframework.scheduling.support.TaskUtils$LoggingErrorHandler ERROR 'Unexpected error occurred in scheduled task'. Wątek 'scheduling-1' (spring.task.scheduling.thread-name-prefix) lub 'pool-N-thread-M' — jedyny tani znacznik w logach. Actuator /actuator/scheduledtasks listuje zadania w runtime. | Agent tworzy NOWY root span INTERNAL na każde wykonanie, nazwa z CodeSpanNameExtractor: dla ScheduledMethodRunnable 'KlasaDeklarująca.metoda' (np. 'ReportJob.generate'), dla Runnable z kodu 'NazwaKlasy.run' (dla lambdy 'Config$$Lambda...run'); atrybuty code.namespace/code.function (stabilne semconv: code.function.name); job.system=spring_scheduling tylko przy otel.instrumentation.spring-scheduling.experimental-span-attributes=true. | Bez zmian: javaagent (span per wykonanie, trace_id w MDC przez logback-mdc); otel.instrumentation.methods.include=com.acme.ReportJob[generate] dla zadań programowych; actuator scheduledtasks jako inwentarz. Ze zmianą: @Aspect @Around("@annotation(org.springframework.scheduling.annotation.Scheduled)") nadający UUID w MDC i logujący 'ENTRY scheduled ReportJob.generate'; od Spring 6.2 ThreadPoolTaskScheduler.setTaskDecorator (MDC per wykonanie); dla starszych — opakowanie Runnable przy rejestracji. |
| Quartz i timery EJB | implements org.quartz.Job / InterruptableJob, extends QuartzJobBean (executeInternal); JobBuilder.newJob(X.class).withIdentity("name","group"); XML: JobDetailFactoryBean/JobDetailBean, CronTriggerFactoryBean, SchedulerFactoryBean, MethodInvokingJobDetailFactoryBean (targetObject + targetMethod — dowolna metoda dowolnego beana); quartz.properties / spring.quartz.*; tabele QRTZ_JOB_DETAILS (JOB_CLASS_NAME), QRTZ_CRON_TRIGGERS; @DisallowConcurrentExecution, @PersistJobDataAfterExecution. EJB: @Schedule(hour, minute, persistent) / @Schedules, @Timeout, TimerService.createCalendarTimer, ejb-jar.xml <timer>. | Logger org.quartz.core.JobRunShell DEBUG 'Calling execute on job DEFAULT.reportJob'; INFO 'Job DEFAULT.reportJob threw a JobExecutionException: '; ERROR 'Job ... threw an unhandled Exception: '. org.quartz.core.QuartzSchedulerThread DEBUG 'batch acquisition of 1 triggers'. Włączenie: logging.level.org.quartz.core=DEBUG. | Agent quartz-2.0: span INTERNAL 'grupa.nazwa' z JobKey (np. 'DEFAULT.reportJob'), atrybuty code.namespace/code.function = klasa joba / 'execute'. Timery EJB: brak instrumentacji EJB w agencie — span tylko jeśli z timera wychodzi coś instrumentowanego (JDBC, HTTP), bez rodzica-wejścia. | Bez zmian: DEBUG JobRunShell (JobKey = ID wejścia, fire instance id w QRTZ_FIRED_TRIGGERS); javaagent. Ze zmianą: JobListener (scheduler.getListenerManager().addJobListener) — jobToBeExecuted/jobWasExecuted, MDC z context.getFireInstanceId(); EJB: @AroundTimeout interceptor. |
| Spring Batch i wejścia CLI/startowe (main, CommandLineRunner, ApplicationRunner, picocli, zdarzenia startu) | public static void main(String[]) (wiele klas z main = wiele wejść; Main-Class / Start-Class w MANIFEST, spring-boot-maven-plugin <mainClass>); implements CommandLineRunner / ApplicationRunner (+ @Order); @EventListener(ApplicationReadyEvent.class / ContextRefreshedEvent), ServletContextListener.contextInitialized, @Startup @Singleton + @PostConstruct (EJB), @Observes StartupEvent (Quarkus); Spring Batch: @EnableBatchProcessing, beany Job (JobBuilder/JobBuilderFactory), Step, ItemReader/Processor/Writer, XML <batch:job id><batch:step><batch:tasklet ref>; spring.batch.job.enabled / spring.batch.job.name; JobLauncher.run / JobOperator.start w kontrolerach lub @Scheduled (wtedy job jest wtórny); picocli @Command + Callable/Runnable, @QuarkusMain / QuarkusApplication; Spring Shell @ShellMethod / @Command. | Batch 5: org.springframework.batch.core.launch.support.TaskExecutorJobLauncher (Batch 4: SimpleJobLauncher) INFO 'Job: [SimpleJob: [name=importJob]] launched with the following parameters: [{...}]' i 'Job: [...] completed with the following parameters: [...] and the following status: [COMPLETED] in 1s23ms'; org.springframework.batch.core.job.SimpleStepHandler INFO 'Executing step: [importStep]', AbstractStep INFO 'Step: [importStep] executed in ...'. Boot: StartupInfoLogger 'Started App in N seconds' — po nim runnery. Tabele BATCH_JOB_EXECUTION / BATCH_STEP_EXECUTION dają historię wejść. | Agent (tylko Batch < 5 i tylko po otel.instrumentation.spring-batch.enabled=true — moduł ma defaultEnabled()=false): span 'BatchJob <jobName>', kroki 'BatchJob <job>.<step>', chunki; spany itemów przy otel.instrumentation.spring-batch.item.enabled=true; otel.instrumentation.spring-batch.experimental.chunk.new-trace=true robi nowy trace per chunk. Batch 5+: obserwacje Micrometer spring.batch.job / spring.batch.step (ObservationRegistry). Runnery/main/zdarzenia startu: brak spanu wejścia (tylko spany wtórne JDBC/HTTP bez rodzica). | Bez zmian: logi INFO Batch (domyślnie włączone), zapytania do BATCH_* (JOB_EXECUTION_ID jako ID korelacji), dla Batch 3–4 otel.instrumentation.spring-batch.enabled=true, otel.instrumentation.methods.include=com.acme.ImportRunner[run]. Ze zmianą: JobExecutionListener.beforeJob z MDC 'jobExecutionId'; w runnerze/main MDC.put na początku; dla Batch 5+ ObservationRegistry w JobRepository/JobLauncher. |
| Zdarzenia in-process: @EventListener, @TransactionalEventListener, @Async, CDI @Observes, Guava EventBus | @EventListener (classes, condition SpEL), implements ApplicationListener<E>, @TransactionalEventListener(phase = AFTER_COMMIT domyślnie \| BEFORE_COMMIT \| AFTER_ROLLBACK \| AFTER_COMPLETION, fallbackExecution), @Async na listenerze + @EnableAsync, SimpleApplicationEventMulticaster z setTaskExecutor (wszystkie listenery async); publikacja: ApplicationEventPublisher.publishEvent, AbstractAggregateRoot.registerEvent / @DomainEvents (Spring Data — przy repository.save); CDI: @Observes / @ObservesAsync, Event<T>.fire/fireAsync, @Observes(during = TransactionPhase.AFTER_SUCCESS); Guava: @Subscribe + EventBus.register; Spring Modulith @ApplicationModuleListener (= @Async + @TransactionalEventListener + REQUIRES_NEW). | Brak logów frameworka per zdarzenie. Pośrednio: AbstractPlatformTransactionManager DEBUG 'Initiating transaction commit' — handler AFTER_COMMIT wykonuje się po tej linii; wątek 'task-N' (spring.task.execution.thread-name-prefix) dla @Async. Spring Modulith: tabela EVENT_PUBLICATION z completion_date. | Brak spanów dla dispatchu zdarzeń. Agent propaguje kontekst przez instrumentację executors, więc handler @Async zostaje w tym samym trace (bez własnego spanu). Spring Modulith: spring-modulith-observability (spany per moduł). | Ze zmianą: @Aspect na @annotation(EventListener) \|\| @annotation(TransactionalEventListener) logujący 'ENTRY event OrderPlaced → InvoiceListener.on' z ID z MDC; własny ApplicationEventMulticaster opakowujący listenery; dla @Async ThreadPoolTaskExecutor.setTaskDecorator(new ContextPropagatingTaskDecorator()) (6.1+) albo własny TaskDecorator kopiujący MDC.getCopyOfContextMap(). Bez zmian: javaagent + otel.instrumentation.methods.include na metodach handlerów. |
| Axon: @CommandHandler, @EventHandler, @SagaEventHandler, @QueryHandler, @DeadlineHandler | @CommandHandler (metoda lub konstruktor @Aggregate / @AggregateRoot), @EventHandler, @SagaEventHandler(associationProperty) w @Saga, @StartSaga/@EndSaga, @QueryHandler, @DeadlineHandler, @ResetHandler; @ProcessingGroup("name"); axon.eventhandling.processors.<name>.mode=tracking\|pooled\|subscribing; dispatch: CommandGateway.send/sendAndWait, QueryGateway.query, EventGateway.publish. @EventSourcingHandler to NIE wejście. | LoggingSpanFactory (org.axonframework.tracing.LoggingSpanFactory) jako SpanFactory: INFO '[<id>][CommandBus.handleCommand] Handler span started for message of type [<typ>] and identifier [<id>]', '[<id>][<nazwa>] Root trace started', '<Dispatch> span started for message of type [...] ... while handling message of type [...]', '[<id>][<nazwa>] Span ended', '[...] Span recorded exception'; DEBUG 'Made current for thread [...]' / 'Closed for thread [...]'. Properties: axon.tracing.show-event-sourcing-handlers, axon.tracing.event-processor.distributed-in-same-trace, axon.tracing.attribute-providers.*. TrackingEventProcessor INFO o claimach segmentów i resetach. | Z axon-tracing-opentelemetry: spany 'CommandBus.dispatchCommand(CreateOrderCommand)', 'CommandBus.handleCommand(CreateOrderCommand)', 'CommandBus.dispatchDistributedCommand'/'handleDistributedCommand' (rozproszone), 'StreamingEventProcessor.batch' (nowy root), 'StreamingEventProcessor.process(OrderCreatedEvent)' (link do trace publikacji) / 'EventProcessor.process(...)' (subscribing, child). Nazwa = operacja + '(' + nazwa wiadomości + ')' (OpenTelemetrySpanFactory.formatName); handler span ma SpanKind CONSUMER, link zamiast parenta gdy nie child trace. Atrybuty axon_message_name, axon_message_type, axon_payload_type, axon_message_id, axon_aggregate_identifier, axon_metadata_*. Agent OTel sam nie instrumentuje Axona. | Bez zmian w kodzie biznesowym: bean LoggingSpanFactory lub OpenTelemetrySpanFactory. Ze zmianą: MessageHandlerInterceptor (registerHandlerInterceptor na CommandBus / procesorze) — MDC z MetaData; wbudowany CorrelationDataProvider (MessageOriginProvider: correlationId, traceId w MetaData) przenosi ID z komendy do zdarzeń. |
| Spring Integration: inbound adaptery/bramy, @ServiceActivator, @MessagingGateway | XML: <int-http:inbound-gateway path request-channel>, <int-jms:message-driven-channel-adapter destination channel>, <int-file:inbound-channel-adapter directory><int:poller fixed-rate/></...>, <int-jdbc:inbound-channel-adapter query>, <int:service-activator input-channel ref method>, <int:gateway service-interface default-request-channel>; Java DSL: IntegrationFlow.from(Http.inboundGateway("/x")) / from(Jms.messageDrivenChannelAdapter(...)) / from(Files.inboundAdapter(dir), e -> e.poller(...)); @ServiceActivator(inputChannel), @Transformer, @Router, @Splitter, @InboundChannelAdapter(poller=@Poller) (metoda-źródło wywoływana cyklicznie), @MessagingGateway + @Gateway; @EnableIntegration. | Logger org.springframework.integration.channel (AbstractMessageChannel) DEBUG "preSend on channel 'bean 'ordersChannel'...', message: GenericMessage [payload=..., headers={id=..., timestamp=...}]" i 'postSend (sent=true) on channel ...'; org.springframework.integration.handler DEBUG o odebraniu wiadomości przez handler. Włączenie: logging.level.org.springframework.integration=DEBUG. @EnableMessageHistory / <int:message-history/> dodaje nagłówek 'history' (name, type, timestamp). Nagłówek 'id' (UUID) jako ID wewnątrz przepływu; correlationId przy splitterze/agregatorze. | Agent: globalny ChannelInterceptor (otel.instrumentation.spring-integration.global-channel-interceptor-patterns, domyślnie '*'), span CONSUMER z destination = nazwa kanału ('<kanał> process' w legacy semconv), propagacja przez nagłówki wiadomości; spany producenta przy otel.instrumentation.spring-integration.producer.enabled=true. Wejścia z HTTP/JMS mają dodatkowo spany protokołów. SI 6+: @EnableIntegrationManagement(observationPatterns="*") (Micrometer). | Bez zmian: DEBUG jw. + <int:message-history/> (zmiana konfiguracji). Ze zmianą: @GlobalChannelInterceptor(patterns="*") z ChannelInterceptor.preSend dopisującym nagłówek korelacji i MDC; wire-tap (<int:wire-tap channel="logger"/>, <int:logging-channel-adapter level="INFO" log-full-message="true"/>). |
| Struts 1 / Struts 2: akcje z XML, wildcardy i Convention plugin | Struts 1: web.xml servlet org.apache.struts.action.ActionServlet z url-pattern *.do, struts-config.xml <action path="/login" type="com.acme.LoginAction" name="loginForm"><forward/>, klasy extends Action (execute) / DispatchAction / LookupDispatchAction / MappingDispatchAction (metoda z parametru requestu, <action parameter="method">). Struts 2: struts.xml <package namespace><action name="order_*" class="OrderAction" method="{1}">, Dynamic Method Invocation (struts.enable.DynamicMethodInvocation, 'order!save.action'), Convention plugin: klasy w pakietach action/actions/struts/struts2 (struts.convention.package.locators) z sufiksem Action albo implements Action, adnotacje @Action/@Actions/@Namespace/@Result; akcje jako beany Springa (struts2-spring-plugin, class="beanName"). | Struts 2 (Log4j2 API): org.apache.struts2.dispatcher.Dispatcher TRACE 'Processing action, namespace: {}, name: {}, method: {}'; DefaultActionInvocation DEBUG 'Executing action method = {}' (logger org.apache.struts2.DefaultActionInvocation w Struts 7, com.opensymphony.xwork2.DefaultActionInvocation w 2.x–6.x) oraz DEBUG 'Executing normal interceptor: {}'. Struts 1: commons-logging org.apache.struts.action.RequestProcessor DEBUG "Processing a 'POST' for path '/login'" (zweryfikowane w źródle). Najtańszy ślad: access log (URL *.do / *.action wskazuje akcję). | Agent struts: http.route = [context path] + namespace + nazwa akcji Z KONFIGURACJI (wzorzec, np. '/order_*'), bez '.action' — server span 'GET /order_*'; span INTERNAL 'OrderAction.list' tylko przy controller-telemetry.enabled=true. Struts 1: tylko span servletu ('POST' / 'POST *.do' z url.path '/login.do'). | Bez zmian: access log + mapowanie URL→klasa ze struts-config.xml/struts.xml + DEBUG/TRACE jw. Ze zmianą: Struts 2 Interceptor (<interceptor-ref> w domyślnym stosie) logujący invocation.getProxy().getActionName()/getMethod() + MDC; Struts 1: własny RequestProcessor (processActionPerform) w <controller processorClass>. |
| Micronaut i Quarkus: kontrolery, messaging, scheduler (przetwarzanie w czasie kompilacji) | Micronaut: @Controller("/x") + @Get/@Post/@Put/@Delete (io.micronaut.http.annotation), @KafkaListener + @Topic (io.micronaut.configuration.kafka.annotation), @RabbitListener + @Queue, @JMSListener, @Scheduled (io.micronaut.scheduling.annotation), @EventListener (io.micronaut.runtime.event.annotation), @Command (picocli). Quarkus: JAX-RS @Path (Quarkus REST), @Route (io.quarkus.vertx.web), @Incoming/@Outgoing (SmallRye Reactive Messaging; kanał → topic w mp.messaging.incoming.<kanał>.connector/topic), @Scheduled (io.quarkus.scheduler), @ConsumeEvent (Vert.x event bus), @Observes StartupEvent, @QuarkusMain / QuarkusApplication, @GrpcService. | Quarkus access log: quarkus.http.access-log.enabled=true, quarkus.http.access-log.pattern (np. '%h %t "%r" %s %D %{i,X-Request-Id}'), logger io.quarkus.http.access-log; quarkus.log.category."io.quarkus.scheduler".level=DEBUG. Micronaut: micronaut.server.netty.access-logger.enabled=true (logger HTTP_ACCESS_LOGGER, log-format common\|combined\|własny). Dopasowanie trasy: Micronaut 4 — logger io.micronaut.http.server.RequestLifecycle na TRACE: 'Matched route GET - /users/7 to controller class com.acme.UserController' (zweryfikowane w źródle); Micronaut 3 — analogiczny komunikat w io.micronaut.http.server.netty.RoutingInBoundHandler (DEBUG, do sprawdzenia w wersji). | Quarkus: quarkus-opentelemetry; HTTP server span '{METHOD} {route}', messaging '<kanał/topic> process'/'receive', scheduler przy quarkus.scheduler.tracing.enabled=true. Micronaut: micronaut-tracing-opentelemetry-http (server span), kafka/rabbit przez moduły micronaut-tracing; javaagent działa na JVM, nie w GraalVM native. | Quarkus: @ServerRequestFilter (Quarkus REST) / @RouteFilter z MDC; dla @Incoming — IncomingInterceptor (io.smallrye.reactive.messaging.IncomingInterceptor) lub metadane wiadomości; Micronaut: @Filter("/**") HttpServerFilter / @ServerFilter + @RequestFilter (4.x). Bez zmian: access log, poziomy logów, quarkus.otel.*. |
| Testy integracyjne jako wejścia (MockMvc, WebTestClient, TestRestTemplate, @SpringBootTest) | @SpringBootTest(webEnvironment = MOCK (domyślnie) \| RANDOM_PORT \| DEFINED_PORT), @AutoConfigureMockMvc, @WebMvcTest(Controller.class) (serwisy jako @MockBean/@MockitoBean), @WebFluxTest, @DataJpaTest; MockMvc.perform(get("/x")), MockMvcTester, WebTestClient, TestRestTemplate, RestTestClient (7.0), RestAssured; @EmbeddedKafka, @Testcontainers + @ServiceConnection; Arquillian @Deployment. Wywołania w teście wskazują wejście (URL, topic) i oczekiwany wynik. | Te same loggery co w produkcji (DispatcherServlet DEBUG działa pod MockMvc). MockMvc .andDo(print()) / .andDo(log()) (logger org.springframework.test.web.servlet.result, DEBUG) wypisuje request, handler ('Handler: Type = com.acme.UserController, Method = com.acme.UserController#get(Long)') i odpowiedź — gotowe mapowanie wejście→handler. Kontekst: org.springframework.test.context.cache DEBUG o reużyciu kontekstu. | MockMvc/WebMvcTest: brak serwera — brak spanu Tomcat/Netty i access logu. Instrumentacja servlet agenta doradza dowolne implementacje Servlet.service/Filter.doFilter, więc wywołanie DispatcherServlet przez MockFilterChain najpewniej tworzy server span (bez server.port/network.* z prawdziwego połączenia) — potwierdzić eksperymentem w wersji agenta. RANDOM_PORT + TestRestTemplate: pełny server span jak w produkcji i span klienta HTTP po stronie testu (rodzic trace'u). Agent dołączany przez -javaagent w argLine surefire/failsafe. | Bez zmian w kodzie produkcyjnym: JUnit 5 extension (@ExtendWith albo globalnie: META-INF/services/org.junit.jupiter.api.extension.Extension + junit.jupiter.extensions.autodetection.enabled=true) ustawiająca MDC 'testId' = klasa#metoda i nagłówek X-Request-Id przez MockMvcBuilderCustomizer / interceptor RestTemplateBuilder; TestExecutionListener Springa (META-INF/spring.factories) dla znacznika 'ENTRY test ...'. |
| Identyfikator korelacji i znacznik wejścia: MDC, traceparent, nazwy kluczy w różnych stosach | Zależności: opentelemetry-javaagent (-javaagent w skryptach startowych, JAVA_TOOL_OPTIONS, Dockerfile), micrometer-tracing-bridge-otel / -brave, spring-cloud-starter-sleuth; w logback.xml/log4j2.xml wzorce %X{traceId}, %X{trace_id}, %X{X-B3-TraceId}, %X{requestId}; istniejące filtry/interceptory z MDC.put; nagłówki X-Request-Id, X-Correlation-Id, traceparent (W3C), b3 / X-B3-TraceId (Zipkin). | Micrometer Tracing w Boot 3.2+: MDC traceId/spanId, Boot dokleja '[traceId-spanId] ' do wzorca (logging.pattern.correlation, domyślnie gdy jest tracing); regex '\[([0-9a-f]{32})-([0-9a-f]{16})\]' (przy braku trace — puste/dopełnione pole). W nowszym Boot (po 4.0) klucze zmienia management.tracing.mdc.trace-id-key/span-id-key, a domyślny wzorzec korelacji podąża za nimi. Agent OTel: dopisać 'trace_id=%X{trace_id} span_id=%X{span_id}'. Sleuth 3.x: '[app,traceId,spanId]'; Sleuth 2.x: '[app,traceId,spanId,exportable]' i klucze MDC X-B3-TraceId/X-B3-SpanId. | Agent: logback-mdc / log4j-context-data wstrzykują trace_id, span_id, trace_flags (otel.instrumentation.common.logging.trace-id-key / span-id-key / trace-flags-key; baggage przy otel.instrumentation.logback-mdc.add-baggage=true). Wartości są w mapie MDC zdarzenia logowania, ale MDC.get("trace_id") w kodzie aplikacji zwraca null. Dowolne metody jako spany: otel.instrumentation.methods.include=com.acme.Foo[bar,baz];com.acme.Job[run]. | Bez zmian w kodzie: (1) -javaagent z -Dotel.traces.exporter=none (same ID w logach bez backendu); (2) otel.instrumentation.methods.include dla wejść nieinstrumentowanych (handlery Axon, @EventListener, timery EJB); (3) zmiana wzorca logback i poziomów loggerów frameworka. Ze zmianą: jeden 'entry marker' per typ wejścia (Filter, ServerInterceptor, RecordInterceptor, advice chain AMQP, JobListener Quartz, aspekt @Scheduled/@EventListener) logujący 'FLOW-ENTRY type=http\|kafka\|jms\|scheduled\|event name=<route/topic/job> handler=<klasa#metoda> id=<id>' i 'FLOW-EXIT ... status=... durationMs=...'; ID przejmij z nagłówka/metadanych, inaczej nadaj; czyść MDC w finally. |
| JSF (FacesServlet, akcje managed beanów) i Spring Web Flow | web.xml <servlet-class>javax.faces.webapp.FacesServlet</servlet-class>; faces-config.xml <managed-bean>, <navigation-rule>; @ManagedBean / @Named + @ViewScoped/@SessionScoped; w .xhtml/.jsp atrybuty action="#{...}", actionListener, listener w f:ajax, p:remoteCommand; Spring Web Flow: *-flow.xml <view-state>/<action-state evaluate expression="...">. | Mojarra przez JUL: logger javax.faces / jakarta.faces (np. javax.faces.lifecycle na FINE pokazuje fazy cyklu życia); MyFaces org.apache.myfaces na DEBUG. Spring Web Flow: org.springframework.webflow DEBUG (wejście do stanów, wykonywane akcje). Access log pokazuje tylko widok, nie akcję. | Agent jsf-mojarra / jsf-myfaces: server span przemianowany na ID widoku (np. 'POST /orders.xhtml'); span akcji z nazwą wyrażenia EL (np. '#{orderBean.save}') — format i bramkowanie controller-telemetry do potwierdzenia w wersji agenta. | Bez zmian: access log + mapowanie EL→metoda statycznie z widoków. Ze zmianą: PhaseListener (faces-config.xml <lifecycle><phase-listener>) na INVOKE_APPLICATION logujący ID widoku i źródło zdarzenia (komponent → wyrażenie action) + MDC; dla Web Flow FlowExecutionListener. |
| GraphQL (Spring for GraphQL, graphql-java, DGS) | Pliki schema *.graphqls (type Query/Mutation/Subscription — lista wejść); Spring: @Controller + @QueryMapping / @MutationMapping / @SubscriptionMapping / @SchemaMapping / @BatchMapping; DGS: @DgsComponent + @DgsQuery/@DgsMutation/@DgsData; graphql-java: RuntimeWiring.newRuntimeWiring().type("Query", b -> b.dataFetcher("user", ...)); kickstart: GraphQLQueryResolver. | Spring for GraphQL: loggery org.springframework.graphql (DEBUG przy wykonaniu żądania; dokładne teksty do sprawdzenia w wersji). Access log zawsze ten sam URL. | HTTP: server span 'POST /graphql' dla wszystkich operacji. graphql-java (agent): span z typem i nazwą operacji (np. 'query GetUser'), atrybuty graphql.operation.type, graphql.operation.name, graphql.document (konfigurowalne); spany data fetcherów domyślnie wyłączone. Spring for GraphQL bez agenta: obserwacje Micrometer graphql.request i graphql.datafetcher. | Bez zmian: javaagent (nazwa operacji w spanie). Ze zmianą: WebGraphQlInterceptor (Spring) logujący operationName i ID dokumentu + MDC; graphql-java Instrumentation (beginExecution) dla innych stosów. |
| WebSocket / STOMP (@MessageMapping) i SSE | @EnableWebSocketMessageBroker + WebSocketMessageBrokerConfigurer.registerStompEndpoints; @Controller z @MessageMapping("/orders") / @SubscribeMapping, setApplicationDestinationPrefixes("/app"); @EnableWebSocket + WebSocketHandler (TextWebSocketHandler.handleTextMessage); JSR 356: @ServerEndpoint("/ws") + @OnMessage; SSE: SseEmitter / Flux<ServerSentEvent>. | logging.level.org.springframework.web.socket=DEBUG i org.springframework.messaging=DEBUG (sesje, ramki, wybór handlera @MessageMapping — teksty do sprawdzenia); WebSocketMessageBrokerStats INFO co 30 min (liczba sesji). | Brak spanów per wiadomość w agencie (do sprawdzenia w aktualnej wersji); widać tylko handshake jako server span 'GET /ws' trwający całe połączenie lub krótko (101). Spring 6.1+: obserwacje Micrometer dla wiadomości STOMP (do weryfikacji). | Ze zmianą: ChannelInterceptor na clientInboundChannel (configureClientInboundChannel) — preSend loguje destination, sessionId i ustawia MDC; dla JSR 356 kod w @OnMessage lub dekorator WebSocketHandler (WebSocketHandlerDecorator). |
| Zdalne wywołania legacy: RMI, EJB @Remote, Spring Remoting (HttpInvoker/Hessian/Burlap) | RMI: interfejs extends java.rmi.Remote, implementacja extends UnicastRemoteObject / UnicastRemoteObject.exportObject, Registry.bind/rebind, Naming.rebind; EJB: @Remote / @Stateless z interfejsem zdalnym, EJB 2.x ejb-jar.xml <session><home><remote><ejb-class>, extends EJBObject / SessionBean; Spring: RmiServiceExporter, HttpInvokerServiceExporter, HessianServiceExporter, BurlapServiceExporter w XML (bean name="/OrderService" — URL), HttpRequestHandlerServlet w web.xml. | RMI: -Djava.rmi.server.logCalls=true (logger sun.rmi.server.call, loguje każde zdalne wywołanie); EJB: logi serwera aplikacyjnego (np. WildFly org.jboss.ejb.client / org.jboss.as.ejb3 na DEBUG); Spring remoting: org.springframework.remoting DEBUG. | Agent rmi: server span 'pakiet.Interfejs/metoda' (SpanKind SERVER, rpc.system=java_rmi, rpc.service, rpc.method). Spring HttpInvoker/Hessian: tylko server span HTTP 'POST /remoting/OrderService' (wszystkie metody na jednym URL). EJB remote przez protokoły serwera (IIOP, http-remoting WildFly, T3 WebLogic): brak instrumentacji w agencie. | Bez zmian: javaagent (RMI), java.rmi.server.logCalls. Ze zmianą: EJB @AroundInvoke interceptor (ejb-jar.xml <interceptor-binding> dla wszystkich beanów — bez zmiany klas) z MDC; Spring Remoting — RemoteInvocationExecutor / interceptory na eksporterze. |
| Apache Camel: trasy from(...) jako wejścia | extends RouteBuilder z configure() i from(...)/routeId(...); XML <camelContext><route><from uri="..."/>; YAML/XML DSL w resources/camel/*; bean(OrderService.class, "handle") / .to("bean:orderService?method=handle") — wskazanie metody biznesowej; rest("/api").get("/x").to("direct:y") (Rest DSL). | Start: INFO z listą tras i ich konsumentów (np. 'Started route1 (jms://queue:orders)' w Camel 3/4; w 2.x 'Route: route1 started and consuming from: ...'). Tracer: camel.main.tracing=true / camelContext.setTracing(true) — logger org.apache.camel.Tracing loguje każdy krok wymiany z exchangeId. Log EIP: .log("...") z ${exchangeId}. | Camel 2.20–2.x z agentem: spany per endpoint konsumenta/producenta (nazwa wg komponentu, np. nazwa kolejki lub URI). Camel 3/4: camel-opentelemetry tworzy spany dla tras i endpointów (nazwy wg URI endpointu / routeId — sprawdzić w wersji); spany transportu (JMS, HTTP) z agenta nadal powstają. | Bez zmian: tracing Camela w konfiguracji, lista tras przy starcie, exchangeId jako ID korelacji (breadcrumbId w 2.x). Ze zmianą: InterceptStrategy / interceptFrom() logujące routeId + MDC (camel.main.use-mdc-logging=true wkłada camel.exchangeId, camel.routeId do MDC bez kodu). |

### Wyjątki i ich wpływ na przebieg

**Spring Web MVC: @Controller/@RestController i inne HandlerMapping**

- Dispatch ASYNC/ERROR/FORWARD/INCLUDE to nie nowe wejście
  - Jak rozpoznać: Linia zaczyna się od '"ERROR" dispatch for GET "/error"' albo '"ASYNC" dispatch'; wyjście 'Exiting from "ERROR" dispatch, status 500' zamiast 'Completed'; 'Mapped to' NIE jest logowane na DEBUG dla ASYNC (tylko TRACE)
  - Wpływ: Naiwny parser policzy 2 requesty; /error wskazuje BasicErrorController zamiast właściwego handlera
- 404 / zasoby statyczne mapowane na ResourceHttpRequestHandler
  - Jak rozpoznać: 'Mapped to ResourceHttpRequestHandler [classpath [static/] ...]' albo NoResourceFoundException (6.1+)
  - Wpływ: Wejście bez klasy aplikacyjnej — pominąć albo oznaczyć jako 'nie trafiło do aplikacji'
- Request zatrzymany w filtrze (Spring Security, CORS, rate limit) nigdy nie dochodzi do DispatcherServlet
  - Jak rozpoznać: Jest wpis w access logu, brak linii DispatcherServlet; status 401/403
  - Wpływ: Wejście istnieje, ale przebieg kończy się w filtrze — modelować jako osobny węzeł
- Kontrolery z interfejsów, kompozytowe adnotacje, RouterFunction
  - Jak rozpoznać: Brak @RequestMapping w klasie, jest w implementowanym interfejsie / w adnotacji użytkownika / w beanie RouterFunction
  - Wpływ: Regex na '@GetMapping' w klasie gubi endpointy; trzeba rozwiązywać meta-adnotacje i hierarchię typów
- Spring <=5.0 (Boot 1.x/2.0): zupełnie inny format logów
  - Jak rozpoznać: DispatcherServlet DEBUG 'DispatcherServlet with name 'dispatcherServlet' [resumed ]processing GET request for [/users/7]'; RequestMappingHandlerMapping DEBUG 'Looking up handler method for path /users/7' i 'Returning handler method [public ... UserController.get(java.lang.Long)]'; FrameworkServlet 'Successfully completed request' / 'Could not complete request' / 'Leaving response open for concurrent processing'; przy starcie INFO 'Mapped "{[/users/{id}],methods=[GET]}" onto public ...'
  - Wpływ: Parser pisany pod 5.1+ nie widzi żadnego wejścia; zaletą starszych wersji jest tabela mapowań na INFO (domyślnie widoczna) i brak statusu w linii końca — status brać z access logu
- Request asynchroniczny (DeferredResult, Callable, WebAsyncTask, SseEmitter, Mono w MVC)
  - Jak rozpoznać: 'Exiting but response remains open for further handling', potem '"ASYNC" dispatch for ...' i dopiero wtedy 'Completed' — często na innym wątku
  - Wpływ: Koniec przebiegu jest w drugim dispatchu; MDC z pierwszego wątku nie przechodzi automatycznie
- MultiActionController / MethodNameResolver (Spring <=4.3): metoda wybierana z URL lub parametru
  - Jak rozpoznać: extends MultiActionController, bean ParameterMethodNameResolver (paramName="action")
  - Wpływ: Statycznie jedno wejście = wiele metod publicznych z sygnaturą (HttpServletRequest, HttpServletResponse); 'Returning handler' wskazuje tylko klasę
- Linia wejścia na TRACE ma dopisane nagłówki
  - Jak rozpoznać: ', headers={masked}' albo pełne nagłówki po 'parameters={...}'
  - Wpływ: Regex zakotwiczony na '\}$' po parametrach przestaje dopasowywać przy podniesieniu poziomu do TRACE

**Servlet / Filter / web.xml / JSP i access log kontenera**

- Access log zapisuje się po zakończeniu requestu i nie zna handlera
  - Jak rozpoznać: Znacznik czasu %t to czas przyjęcia, ale linia pojawia się po odpowiedzi; brak nazwy klasy
  - Wpływ: Do łączenia z logami aplikacji potrzebny wspólny ID w nagłówku, nie samo dopasowanie po czasie
- Programowa rejestracja servletów (WebApplicationInitializer, ServletRegistrationBean, web-fragment.xml w zależnościach)
  - Jak rozpoznać: Brak web.xml i @WebServlet, a jest servletContext.addServlet(...)/new ServletRegistrationBean albo META-INF/web-fragment.xml w jarze
  - Wpływ: Statyczny skan samego XML/adnotacji aplikacji gubi wejścia
- Brak czyszczenia MDC w filtrze
  - Jak rozpoznać: Ten sam requestId w logach różnych requestów na tym samym wątku http-nio-8080-exec-N
  - Wpływ: Sklejenie dwóch niezależnych przebiegów w jeden
- Jednostka %D zmieniła się z ms na µs w Tomcat 10
  - Jak rozpoznać: Boot 3.x / Tomcat 10.x+, wartości %D ~1000x większe niż oczekiwane
  - Wpływ: Błędny czas trwania wejścia (sekundy zamiast milisekund) przy migracji Boot 2→3
- JSP jako wejście (scriptlety z logiką i SQL w stronie)
  - Jak rozpoznać: URL kończy się na .jsp w access logu; <%@ page %>, <% ... %> z wywołaniami DAO/JDBC
  - Wpływ: Wejście bez klasy Java w źródłach — klasa to wygenerowany org.apache.jsp.x_jsp; mapować na plik .jsp

**Spring WebFlux: adnotacje + RouterFunction, log prefix wymiany**

- MDC gubi się / przecieka między requestami
  - Jak rozpoznać: Logi aplikacji w tym samym przebiegu mają różne albo puste requestId; wątki reactor-http-nio-*, boundedElastic-*
  - Wpływ: Korelacja po MDC nieważna — korelować po log prefixie albo trace_id z agenta
- Streaming (Flux/SSE/NDJSON) kończy się dużo później niż handler
  - Jak rozpoznać: Content-Type text/event-stream / application/x-ndjson
  - Wpływ: Czas wejścia ≠ czas od HTTP do Completed; przebieg może zawierać wiele cykli dostępu do danych
- context-propagation=auto przenosi tylko klucze, dla których jest ThreadLocalAccessor
  - Jak rozpoznać: traceId z Micrometer jest w logach handlera, ale własny requestId z MDC.put w WebFilterze nie
  - Wpływ: Częściowa korelacja — wygląda na działającą, ale klucz aplikacyjny ginie po pierwszym publishOn

**JAX-RS (Jersey, RESTEasy, CXF, Quarkus REST)**

- Interfejsy z @Path to często KLIENCI (MicroProfile @RegisterRestClient, RESTEasy proxy, CXF JAXRSClientFactory), nie wejścia
  - Jak rozpoznać: Interfejs z @RegisterRestClient albo używany przez RestClientBuilder/WebTarget.proxy; brak implementacji w aplikacji
  - Wpływ: Fałszywe wejścia w grafie; to wyjścia
- Sub-resource locator: wejście rozkłada się na łańcuch klas
  - Jak rozpoznać: Metoda z @Path bez @GET itp., zwracająca typ z kolejnymi @GET
  - Wpływ: Pełny route i handler trzeba składać po łańcuchu; http.route bywa niepełne
- Adnotacje JAX-RS na interfejsie, implementacja bez adnotacji
  - Jak rozpoznać: Klasa implements XxxApi (np. z generatora OpenAPI) bez @Path
  - Wpływ: Regex po klasie gubi wejście
- RESTEasy 6+ (WildFly 27+) poza wsparciem agenta
  - Jak rozpoznać: resteasy-core 6.x/7.x w zależnościach lub modułach serwera
  - Wpływ: Server span tylko z servletu/undertow — brak http.route z @Path; route trzeba odtworzyć statycznie

**SOAP: JAX-WS (@WebService, CXF, Metro, Axis2) i Spring-WS (@Endpoint)**

- Access log / span HTTP pokazują ten sam URL dla wszystkich operacji
  - Jak rozpoznać: Wszystkie wejścia 'POST /services/OrderService' albo 'POST /ws' (Spring-WS, Metro bez updatera)
  - Wpływ: Bez SOAPAction/QName Body nie da się rozróżnić use case'ów — logować operację w interceptorze; w CXF z agentem operacja jest w nazwie spanu
- Provider<Source>/Provider<SOAPMessage> (@WebServiceProvider) — jedna metoda invoke dla wszystkich operacji
  - Jak rozpoznać: @WebServiceProvider, implements Provider<...>
  - Wpływ: Routing ręczny (switch po elemencie XML) — statyczny graf widzi jedno wejście
- Kod wygenerowany z WSDL wygląda jak wejście, ale to klient
  - Jak rozpoznać: Klasy extends Service z @WebServiceClient, interfejsy portów używane przez getPort()
  - Wpływ: Fałszywe wejścia; to wyjścia
- Jakarta XML WS 3.0+ / CXF 4.x (Boot 3) poza oficjalnym wsparciem agenta
  - Jak rozpoznać: jakarta.jws.WebService, cxf-*-4.x w zależnościach
  - Wpływ: Brak nazwy operacji w spanie i brak spanów kontrolera — zostaje 'POST /services/...' z servletu; sprawdzić wersję agenta
- Nazwa loggera CXF zależy od mechanizmu logowania
  - Jak rozpoznać: LoggingInInterceptor (org.apache.cxf.interceptor) vs LoggingFeature (org.apache.cxf.ext.logging)
  - Wpływ: Filtr po kategorii 'org.apache.cxf.services.<Service>...' nie łapie nowego formatu '<PortType>.REQ_IN' i odwrotnie

**gRPC (grpc-java, grpc-spring-boot-starter, Spring gRPC, Quarkus)**

- Streaming: jedno wejście = wiele wiadomości i długi span
  - Jak rozpoznać: rpc w .proto ze 'stream' w żądaniu lub odpowiedzi; span trwa minuty
  - Wpływ: Przebieg to pętla, nie jeden request–response
- Usługi infrastrukturalne (health, reflection) i dwa różne @GrpcService (net.devh vs Spring gRPC)
  - Jak rozpoznać: Pakiet adnotacji; grpc.health.v1.Health, grpc.reflection.v1alpha.ServerReflection
  - Wpływ: Usługi infrastrukturalne nie są use case'ami — odfiltrować
- Serwer in-process (testy) albo gRPC przez kontener servletów (grpc-servlet / Spring gRPC na Tomcat)
  - Jak rozpoznać: InProcessServerBuilder, grpc.server.in-process-name, grpc.server.port=-1; zależność grpc-servlet-jakarta
  - Wpływ: In-process: brak ruchu sieciowego i spanów klient/serwer jak w produkcji; przez servlet dochodzi dodatkowy span HTTP 'POST' nad spanem gRPC

**Konsumenci Kafka: @KafkaListener, kontenery programowe, Spring Cloud Stream, Kafka Streams**

- Wejście bez adnotacji (Spring Cloud Stream funkcyjne, kontener programowy)
  - Jak rozpoznać: Bean Consumer/Function + spring.cloud.function.definition; new ConcurrentMessageListenerContainer
  - Wpływ: Skan adnotacji gubi wejście — czytać konfigurację i wiązać nazwę bindingu z topicem
- Retry topics / ponowienia: ten sam rekord wchodzi wielokrotnie
  - Jak rozpoznać: Topiki z sufiksami -retry-0, -retry-1, -dlt; nagłówki kafka_original-topic, retry_topic-attempts
  - Wpływ: Wiele przebiegów dla jednej wiadomości biznesowej; DLT handler to osobne wejście
- Przy receive-telemetry span receive startuje NOWY trace, a process ma link do producenta
  - Jak rozpoznać: otel.instrumentation.messaging.experimental.receive-telemetry.enabled=true; span links zamiast parent
  - Wpływ: Narzędzie musi śledzić linki, inaczej rozetnie przebieg producent→konsument
- Nazwa spanu/obserwacji zależy od wersji (agent legacy vs stable semconv; Spring Kafka 3.x 'receive' vs 4.x 'process')
  - Jak rozpoznać: 'orders process' vs 'process orders' vs 'orders receive' dla tego samego listenera
  - Wpływ: Parser nazw spanów musi znać wszystkie warianty albo czytać atrybuty messaging.*
- Surowa pętla consumer.poll(): span process powstaje tylko przy iteracji po ConsumerRecords (agent opakowuje iterator)
  - Jak rozpoznać: records.forEach / for-each → span; przetwarzanie przez records.records(tp) w innym wątku albo przez kopię listy → brak/zerwany kontekst
  - Wpływ: Przetwarzanie w innym wątku wygląda na pracę bez wejścia

**JMS / RabbitMQ / MDB: listenery kolejek**

- MessageListenerAdapter: wejściem jest dowolna metoda POJO wskazana nazwą w XML
  - Jak rozpoznać: <jms:listener method="handleOrder"> albo setDefaultListenerMethod("..."); domyślnie 'handleMessage'
  - Wpływ: Brak adnotacji i interfejsu — łączyć XML z klasą
- Ponowne dostarczenia (redelivery) po rollbacku
  - Jak rozpoznać: JMSRedelivered=true, JMSXDeliveryCount>1; AMQP redelivered=true, nagłówek x-death
  - Wpływ: Kilka przebiegów tej samej wiadomości, część zakończona rollbackiem
- Destynacja MDB poza kodem (JNDI, deskryptory serwera)
  - Jak rozpoznać: activationConfig tylko z destinationLookup='java:/jms/queue/X' albo brak, mapowanie w jboss-ejb3.xml
  - Wpływ: Nazwa kolejki w spanie ≠ nazwa w kodzie; mapować JNDI na fizyczną kolejkę
- Listener batch Spring AMQP (consumerBatchEnabled / List<Message>)
  - Jak rozpoznać: @RabbitListener z parametrem List<...>, factory.setBatchListener(true)
  - Wpływ: Jedno wywołanie metody = wiele wiadomości; korelacja per wiadomość gubi się

**Spring @Scheduled / TaskScheduler / XML task:scheduled-tasks**

- Zadania programowe/lambdy: nazwa spanu nie wskazuje logiki
  - Jak rozpoznać: Span '...$$Lambda...run' albo 'XyzTask.run'
  - Wpływ: Łączyć z miejscem rejestracji w SchedulingConfigurer
- Wiele instancji: każda wykonuje @Scheduled, chyba że ShedLock/Quartz cluster
  - Jak rozpoznać: @SchedulerLock, tabela shedlock w SQL
  - Wpływ: Część wykonań kończy się bez logiki (lock zajęty) — przebieg pusty, ale z SQL do shedlock
- @Scheduled bez @EnableScheduling albo z wyłączonym profilem nie działa
  - Jak rozpoznać: Brak @EnableScheduling/<task:annotation-driven>; @Profile/@ConditionalOnProperty na beanie
  - Wpływ: Statyczne wejście, które nigdy się nie wykonuje
- Zadanie wyłączone konfiguracją: cron="-" (Scheduled.CRON_DISABLED)
  - Jak rozpoznać: @Scheduled(cron="${job.cron}") i job.cron=- w danym profilu
  - Wpływ: Wejście istnieje w kodzie, ale w danym środowisku nigdy nie startuje

**Quartz i timery EJB**

- MethodInvokingJobDetailFactoryBean: wejście nie jest klasą Job
  - Jak rozpoznać: Bean tej klasy w XML z targetObject/targetMethod; code.namespace = MethodInvokingJobDetailFactoryBean$MethodInvokingJob (albo $StatefulMethodInvokingJob przy concurrent=false). Taki JobDetail NIE jest serializowalny, więc występuje tylko z RAMJobStore — nie szukać go w QRTZ_JOB_DETAILS
  - Wpływ: Span/log wskazuje klasę Springa — prawdziwy handler wziąć z XML
- Joby/triggery tylko w bazie (JDBCJobStore), dodawane z UI
  - Jak rozpoznać: org.quartz.jobStore.class=...JobStoreTX / LocalDataSourceJobStore; brak JobBuilder w kodzie dla danego joba
  - Wpływ: Statyczny graf widzi klasę Job, ale nie wie kiedy/czy jest uruchamiana — potrzeba SELECT z QRTZ_*
- Misfire / recovery po restarcie uruchamia zaległe wykonania seriami
  - Jak rozpoznać: requestsRecovery, misfireInstruction; wiele 'Calling execute' tuż po starcie
  - Wpływ: Skupisko przebiegów niezwiązanych z harmonogramem
- @DisallowConcurrentExecution: wykonanie przesunięte, gdy poprzednie trwa
  - Jak rozpoznać: Adnotacja na klasie joba; odstępy między 'Calling execute' nieregularne, misfire w logach
  - Wpływ: Liczba przebiegów ≠ liczba odpaleń triggera; czas startu nie odpowiada cronowi

**Spring Batch i wejścia CLI/startowe (main, CommandLineRunner, ApplicationRunner, picocli, zdarzenia startu)**

- CommandLineRunner i zdarzenia startowe wykonują się przy KAŻDYM starcie, także w @SpringBootTest
  - Jak rozpoznać: Ten sam przebieg runnera w logach testów i każdego deployu
  - Wpływ: Wejście 'startowe' zaszumia przebiegi testowe; oznaczyć
- Spring Batch 5+ niewidoczny dla agenta OTel
  - Jak rozpoznać: spring-batch-core 5.x/6.x, brak spanów 'BatchJob'
  - Wpływ: Polegać na logach INFO / tabelach BATCH_* albo Micrometer
- Job uruchamiany z innego wejścia (REST, @Scheduled) z asynchronicznym TaskExecutorem
  - Jak rozpoznać: jobLauncher.setTaskExecutor(new SimpleAsyncTaskExecutor()); request kończy się przed jobem
  - Wpływ: Przebieg rozcina się na dwa: wejście HTTP i job w innym wątku
- Instrumentacja Spring Batch w agencie jest domyślnie wyłączona
  - Jak rozpoznać: Batch 4.x, agent działa, a spanów 'BatchJob' brak; brak -Dotel.instrumentation.spring-batch.enabled=true
  - Wpływ: Fałszywy wniosek 'job nie wystartował'; job widać tylko jako osierocone spany JDBC
- Spring Batch 6: zmienione pakiety i JobLauncher przestarzały (TaskExecutorJobOperator)
  - Jak rozpoznać: spring-batch-core 6.x, importy org.springframework.batch.core.job.*, JobOperator zamiast JobLauncher
  - Wpływ: Statyczne reguły na 'JobLauncher.run' i nazwy loggerów z Batch 5 mogą nie trafiać — teksty logów sprawdzić w wersji

**Zdarzenia in-process: @EventListener, @TransactionalEventListener, @Async, CDI @Observes, Guava EventBus**

- @TransactionalEventListener bez aktywnej transakcji NIE wykonuje się (chyba że fallbackExecution=true)
  - Jak rozpoznać: publishEvent poza @Transactional; brak logu handlera
  - Wpływ: Statyczna krawędź publish→handler, której w runtime nie ma
- Handler AFTER_COMMIT działa po zatwierdzeniu — zapis wymaga REQUIRES_NEW
  - Jak rozpoznać: phase domyślne AFTER_COMMIT; SQL handlera po 'Initiating transaction commit'
  - Wpływ: Błąd w handlerze nie cofa wejścia; rysować jako dwie transakcje
- @Async / async multicaster gubi MDC i ThreadLocal (SecurityContext, tenant)
  - Jak rozpoznać: Logi handlera bez requestId, wątek task-N/SimpleAsyncTaskExecutor-N
  - Wpływ: Przebieg się rozcina; z agentem OTel trace_id zostaje, z samym MDC nie
- @DomainEvents publikowane niejawnie przy save()
  - Jak rozpoznać: Encja extends AbstractAggregateRoot albo metoda @DomainEvents
  - Wpływ: Krawędź do handlera wychodzi z wywołania repozytorium — graf kodu jej nie widzi
- Od Spring 6.1 @Transactional na @TransactionalEventListener dozwolone tylko z REQUIRES_NEW lub NOT_SUPPORTED
  - Jak rozpoznać: Błąd startu kontekstu przy @Transactional (REQUIRED) na takim listenerze po migracji do 6.1
  - Wpływ: W starszym kodzie taki handler 'pisał' w zakończonej transakcji (zmiany ginęły); po migracji aplikacja nie wstaje — inne zachowanie per wersja

**Axon: @CommandHandler, @EventHandler, @SagaEventHandler, @QueryHandler, @DeadlineHandler**

- Replay / reset tracking processora wywołuje @EventHandler ponownie bez żadnego requestu
  - Jak rozpoznać: Log resetu, @ResetHandler, ReplayStatus.REPLAY w parametrze, @DisallowReplay/@AllowReplay
  - Wpływ: Fałszywe przebiegi produkcyjne; odfiltrować fazę replay
- @EventSourcingHandler i snapshoty wyglądają jak handlery
  - Jak rozpoznać: @EventSourcingHandler w klasie @Aggregate
  - Wpływ: Część ładowania agregatu w ramach komendy, nie osobne wejście
- Tracking/pooled: event handler w innym wątku i transakcji, z opóźnieniem
  - Jak rozpoznać: mode=tracking|pooled, span 'StreamingEventProcessor.batch' jako root
  - Wpływ: Przebieg komendy kończy się przed projekcją; korelacja przez link lub MetaData correlationId

**Spring Integration: inbound adaptery/bramy, @ServiceActivator, @MessagingGateway**

- Pollery: wejście cykliczne bez zdarzenia zewnętrznego
  - Jak rozpoznać: <int:poller>, @Poller, wątek 'task-scheduler-N' / 'scheduling-N'
  - Wpływ: Każdy cykl pollera to przebieg, także pusty — filtrować przebiegi bez wiadomości
- SI 6.0+ niewidoczne dla agenta OTel
  - Jak rozpoznać: spring-integration-core 6.x
  - Wpływ: Micrometer observation albo logi DEBUG
- Kanały ExecutorChannel/QueueChannel zmieniają wątek
  - Jak rozpoznać: <int:channel><int:dispatcher task-executor/>, <int:queue/>
  - Wpływ: MDC się gubi; korelować po nagłówku id/history
- DirectChannel z kilkoma subskrybentami: round-robin/failover
  - Jak rozpoznać: Kilka service-activatorów na tym samym input-channel, <int:dispatcher load-balancer="round-robin" failover="true"/>
  - Wpływ: To samo wejście trafia do różnych handlerów w kolejnych wywołaniach — statyczna krawędź nie jest deterministyczna

**Struts 1 / Struts 2: akcje z XML, wildcardy i Convention plugin**

- Convention plugin: akcje bez XML i adnotacji
  - Jak rozpoznać: struts2-convention-plugin w zależnościach, klasy *Action w pakiecie ...action...
  - Wpływ: URL wyprowadzany z nazwy klasy (OrderListAction → /order-list); skan XML gubi wejścia
- Wildcardy, DMI, DispatchAction: metoda zależy od URL/parametru
  - Jak rozpoznać: method="{1}", 'name!method', parameter="method" w Struts 1
  - Wpływ: Statycznie jedno wejście = wiele metod; http.route z agenta to wzorzec ('/order_*'), więc różne metody mają ten sam route — metodę brać z 'Executing action method' albo spanu kontrolera
- Zmiana pakietów w Struts 7
  - Jak rozpoznać: struts2-core 7.x, importy org.apache.struts2.ActionSupport zamiast com.opensymphony.xwork2.ActionSupport
  - Wpływ: Reguły statyczne i filtry loggerów pisane pod xwork2 nie łapią nowych klas

**Micronaut i Quarkus: kontrolery, messaging, scheduler (przetwarzanie w czasie kompilacji)**

- Wiązanie wejść messagingu przez nazwy kanałów w konfiguracji
  - Jak rozpoznać: @Incoming("orders-in") + mp.messaging.incoming.orders-in.topic=orders
  - Wpływ: Nazwa w spanie (topic) ≠ nazwa w kodzie (kanał); mapować przez properties, także per profil (%prod.)
- Kod wygenerowany ($Definition, _Subclass, $Intercepted) w stosie i nazwach klas
  - Jak rozpoznać: Sufiksy $Definition$Exec, _Subclass, $Intercepted w stack trace/spanach
  - Wpływ: Normalizować do klasy źródłowej przed dopasowaniem do grafu
- Komunikat dopasowania trasy różni się między Micronaut 3 i 4 (klasa i poziom)
  - Jak rozpoznać: micronaut-http-server 4.x: RequestLifecycle TRACE; 3.x: RoutingInBoundHandler
  - Wpływ: Włączenie DEBUG na io.micronaut.http.server w 4.x nie pokaże dopasowania — potrzebny TRACE

**Testy integracyjne jako wejścia (MockMvc, WebTestClient, TestRestTemplate, @SpringBootTest)**

- @WebMvcTest z mockami serwisów — przebieg kończy się na mocku
  - Jak rozpoznać: @MockBean/@MockitoBean dla serwisów/repozytoriów
  - Wpływ: Brak SQL i dalszych klas; nie traktować jako pełnego przebiegu
- Test w transakcji testowej z rollbackiem
  - Jak rozpoznać: @Transactional na klasie testowej (domyślnie rollback), @DataJpaTest
  - Wpływ: Brak COMMIT, flush może nie nastąpić — INSERT/UPDATE może się nie pojawić; handlery AFTER_COMMIT się nie wykonują
- CommandLineRunner i dane startowe przy starcie kontekstu testu
  - Jak rozpoznać: Logi runnera przed pierwszym testem; kontekst reużywany
  - Wpływ: Przebiegi 'startowe' przypisane do pierwszego testu
- MockMvc pod agentem wygląda jak produkcyjny request, choć nie ma kontenera
  - Jak rozpoznać: Server span bez access logu, bez server.port / network.peer.*, wątek 'main' / 'Test worker' zamiast http-nio-*
  - Wpływ: Narzędzie może uznać przebieg testowy za produkcyjny; filtry kontenera (Tomcat valves, filtry spoza kontekstu) nie wystąpiły

**Identyfikator korelacji i znacznik wejścia: MDC, traceparent, nazwy kluczy w różnych stosach**

- Różne nazwy kluczy MDC w zależności od stosu
  - Jak rozpoznać: trace_id (agent OTel) vs traceId (Micrometer/Sleuth 3) vs X-B3-TraceId (Sleuth 2) vs własne requestId
  - Wpływ: Parser musi znać wszystkie warianty; agent + Micrometer mogą współistnieć z RÓŻNYMI ID, jeśli bridge nie jest skonfigurowany
- Brak propagacji przez granice wątków poza instrumentowanymi executorami
  - Jak rozpoznać: new Thread(...), własne pule bez TaskDecorator, Reactor bez context-propagation
  - Wpływ: Przebieg rozcięty; część pracy wygląda na wejście bez źródła
- Wycieki MDC przy reużyciu wątków (pule HTTP, kontenery Kafka/JMS)
  - Jak rozpoznać: Ten sam ID na kolejnych, niezwiązanych wejściach w tym samym wątku
  - Wpływ: Sklejenie różnych przebiegów — ENTRY nadpisuje, EXIT czyści
- Klucze MDC skonfigurowane inaczej niż domyślne (nowszy Boot, agent)
  - Jak rozpoznać: management.tracing.mdc.* albo otel.instrumentation.common.logging.trace-id-key w konfiguracji
  - Wpływ: Regex na '[traceId-spanId]' lub 'trace_id=' nic nie znajduje mimo działającego tracingu

**JSF (FacesServlet, akcje managed beanów) i Spring Web Flow**

- Wiele akcji na jednym URL widoku
  - Jak rozpoznać: Wszystkie wejścia 'POST /orders.xhtml'; parametr javax.faces.source / jakarta.faces.source w ciele
  - Wpływ: Use case rozróżnia dopiero komponent źródłowy — bez PhaseListenera lub spanu akcji wejścia się zlewają
- Akcja zatrzymana przez walidację (faza PROCESS_VALIDATIONS)
  - Jak rozpoznać: Komunikaty FacesMessage, brak wywołania metody akcji, odpowiedź 200 z tym samym widokiem
  - Wpływ: Wejście bez logiki biznesowej mimo statusu 200

**GraphQL (Spring for GraphQL, graphql-java, DGS)**

- Anonimowe operacje i batch wielu operacji
  - Jak rozpoznać: Brak operationName w żądaniu; span tylko 'query'
  - Wpływ: Nie da się nazwać use case'u bez parsowania dokumentu — klasyfikować po polach głównych
- Resolvery pól zagnieżdżonych (@SchemaMapping) wołane N razy
  - Jak rozpoznać: Wiele wywołań tej samej metody w jednym przebiegu, często z N+1 SQL; @BatchMapping/DataLoader to łagodzi
  - Wpływ: Przebieg jednego wejścia ma pętle zależne od kształtu zapytania klienta
- Subscription przez WebSocket/SSE
  - Jak rozpoznać: @SubscriptionMapping, spring.graphql.websocket.path
  - Wpływ: Długotrwałe wejście z wieloma zdarzeniami, jak streaming gRPC

**WebSocket / STOMP (@MessageMapping) i SSE**

- Jedno połączenie = wiele wejść
  - Jak rozpoznać: Jeden wpis access logu (101) i długa sesja, wiele wywołań @MessageMapping
  - Wpływ: Access log i span HTTP nie liczą wejść; korelacja po sessionId + destination
- MDC i SecurityContext z handshake nie przechodzą do wątków clientInboundChannel
  - Jak rozpoznać: Wątki clientInboundChannel-N bez requestId
  - Wpływ: Każda wiadomość wymaga własnego ID wejścia

**Zdalne wywołania legacy: RMI, EJB @Remote, Spring Remoting (HttpInvoker/Hessian/Burlap)**

- Wywołanie EJB lokalnie vs zdalnie
  - Jak rozpoznać: @Local i @Remote na tym samym beanie; ten sam kod wywoływany z innego modułu EAR
  - Wpływ: Część wywołań to krawędzie wewnętrzne, część to wejścia — rozstrzygać po wątku/protokole
- HttpInvoker/Hessian: jeden URL na usługę, metoda w zserializowanym ciele
  - Jak rozpoznać: Content-Type application/x-java-serialized-object lub application/x-hessian
  - Wpływ: Access log nie rozróżnia operacji — potrzebny interceptor albo statyczna lista metod interfejsu

**Apache Camel: trasy from(...) jako wejścia**

- Trasy direct:/seda: to krawędzie wewnętrzne, nie wejścia
  - Jak rozpoznać: from("direct:x") / from("seda:x") wołane z innej trasy przez .to("direct:x")
  - Wpływ: Wejściem jest dopiero trasa z konsumentem zewnętrznym; seda zmienia wątek
- Wejścia z pollingiem (file, ftp, sql, timer)
  - Jak rozpoznać: Komponenty file:, ftp:, sql:, timer:, scheduler:
  - Wpływ: Cykliczne przebiegi, część pusta — jak pollery Spring Integration

## Dostęp do danych

### Mechanizmy

| Nazwa | Jak rozpoznać statycznie | W logu | W OTel | Wstrzyknięcie |
|---|---|---|---|---|
| Statyczne rozpoznanie warstwy danych (nie tylko *Repository) | Interfejsy dziedziczące po org.springframework.data.repository.Repository (CrudRepository, ListCrudRepository [Spring Data 3.0+], PagingAndSortingRepository, JpaRepository, R2dbcRepository, ReactiveCrudRepository) albo z @RepositoryDefinition; fragmenty *Impl (repositoryImplementationPostfix); @org.apache.ibatis.annotations.Mapper / @MapperScan / MapperFactoryBean / SqlSessionTemplate / SqlSession; @io.micronaut.data.annotation.Repository, @JdbcRepository(dialect=...); 'extends PanacheRepository<' / 'extends PanacheEntity' (active record: SQL woła sama encja, np. Person.find(...)); pola i parametry typów EntityManager (@PersistenceContext), Session, SessionFactory, HibernateTemplate, JdbcTemplate, NamedParameterJdbcTemplate, JdbcClient, SimpleJdbcInsert, SimpleJdbcCall, org.springframework.jdbc.object.* (MappingSqlQuery, SqlUpdate, StoredProcedure), DSLContext, JPAQueryFactory, SQLQueryFactory, org.jdbi.v3.core.Jdbi/Handle, io.ebean.Database, org.apache.commons.dbutils.QueryRunner, DataSource, Connection; klasy bazowe JdbcDaoSupport, HibernateDaoSupport, SqlMapClientDaoSupport, NamedParameterJdbcDaoSupport; wywołania DriverManager.getConnection, prepareStatement/prepareCall/createStatement, Session.doWork/doReturningWork, em.unwrap(Connection/Session), InitialContext.lookup("java:comp/env/jdbc/..."). W XML: bean class="org.springframework.jdbc.core.JdbcTemplate" / LocalSessionFactoryBean / SqlMapClientFactoryBean / SqlSessionFactoryBean, <jpa:repositories base-package>, persistence.xml, *.hbm.xml, mapper XML z <mapper namespace>. Literały: regex (?is)"\s*(select\s.+\sfrom\|insert\s+into\|update\s+\w+\s+set\|delete\s+from\|merge\s+into\|\{\s*\?=?\s*call)" w stringach, w plikach .sql i .properties (zapytania trzymane poza kodem). | Brak ogólnego. Na starcie Spring Data loguje (logger org.springframework.data.repository.config.RepositoryConfigurationDelegate, INFO, zweryfikowane w kodzie spring-data-commons): 'Bootstrapping Spring Data JPA repositories in DEFAULT mode.' oraz 'Finished Spring Data repository scanning in X ms. Found N JPA repository interfaces.' (osobna para linii dla każdego modułu: JPA, JDBC, MongoDB, Redis...). To daje liczbę repozytoriów do porównania z wynikiem analizy statycznej. | Pośrednio: spany JDBC CLIENT mają rodzica w spanie metody DAO tylko wtedy, gdy ta metoda jest instrumentowana (spring-data domyślnie włączone; MyBatis domyślnie wyłączone od agenta 2.1.0; Hibernate patrz wpis OTel; albo @WithSpan). W innym razie span JDBC wisi bezpośrednio pod spanem HTTP/kontrolera. | Bez zmian w kodzie: agent albo aspekt AOP na metodach typów zakwalifikowanych statycznie. Aspekt rejestruje wejście i wyjście z klasą i metodą i dokłada wpis do MDC (np. flow.dao=Klasa.metoda), więc każdy niżej zalogowany SQL dostaje to pole (o ile log SQL powstaje w tym samym wątku). |
| Spring Data: zapytania pochodne, @Query, nazwane, Specification, Querydsl | @Query(value=..., nativeQuery=true\|false, countQuery=...), @Modifying, @Procedure(procedureName=...), @EntityGraph, @Lock, @QueryHints, @Meta(comment=...). Prefiksy metod find\|read\|get\|query\|search\|stream\|count\|exists\|delete\|remove...By. @NamedQuery(name="Order.findOpen") na encji, <named-query> w orm.xml. Parametry Specification<T> lub Predicate (Querydsl), Pageable (generuje dodatkowe zapytanie COUNT). Spring Data JDBC: @Table/@MappedCollection na encjach, zapytania pochodne od Spring Data JDBC 2.0. | Zapytanie pochodne nie loguje swojego JPQL. SQL widać dopiero na poziomie ORM (org.hibernate.SQL) albo, w Spring Data JDBC, w logach JdbcTemplate (org.springframework.jdbc.core.JdbcTemplate=DEBUG, bo Spring Data JDBC używa NamedParameterJdbcTemplate). Pageable daje drugi SQL 'select count(...)'. | spring-data-1.8 (domyślnie włączone) tworzy span INTERNAL o nazwie InterfejsRepozytorium.metoda (ClassAndMethod z interfejsu), z atrybutami code.namespace/code.function (w nowym semconv code.function.name). Pod nim są spany JDBC CLIENT, a przy włączonej instrumentacji Hibernate także spany Session.* i nazwy zapytań z podsumowania HQL (np. 'SELECT Order'). | Bez zmian: RepositoryProxyPostProcessor (tak robi OTel) albo aspekt na Repository+. Ze zmianą: @Meta(comment="flow:...") lub hint org.hibernate.comment, które dopisują komentarz do SQL widoczny w logu bazy (wymaga hibernate.use_sql_comments=true). |
| Hibernate: logowanie SQL i parametrów (3.x, 4/5, 6.0–6.2, 6.3+) | Konfiguracja: spring.jpa.show-sql, spring.jpa.properties.hibernate.format_sql / highlight_sql / use_sql_comments / generate_statistics / log_slow_query; w persistence.xml <property name="hibernate.show_sql">; Quarkus: quarkus.hibernate-orm.log.sql, log.bind-parameters (w nowszych wersjach zalecana kategoria logów), log.format-sql, log.queries-slower-than-ms. Wersja z zależności: hibernate-core 3.x–5.x (groupId org.hibernate) albo 6.x+ (org.hibernate.orm). | SQL: logging.level.org.hibernate.SQL=DEBUG, komunikat 'select o1_0.id,o1_0.status from orders o1_0 where o1_0.id=?' (H6 aliasy o1_0; H5 order0_). Parametry (zweryfikowane w kodzie hibernate-orm): H6.3+ logger org.hibernate.orm.jdbc.bind=TRACE, 'binding parameter (1:BIGINT) <- [42]' (regex 'binding parameter \((\d+):(\w+)\) <- \[(.*)\]'); H6.0–6.2 ten sam logger org.hibernate.orm.jdbc.bind, ale stary format 'binding parameter [1] as [BIGINT] - [42]'; H4.3/H5 logger org.hibernate.type.descriptor.sql.BasicBinder=TRACE, 'binding parameter [1] as [BIGINT] - [42]' (regex 'binding parameter \[(\d+)\] as \[(\w+)\] - \[(.*)\]'); H3.6 BasicBinder bez nawiasów wokół wartości: 'binding parameter [1] as [BIGINT] - 42', null jako '<null>'; H3.5 i starsze: logger org.hibernate.type, 'binding '42' to parameter: 1'. Odczyt wyników: H6 org.hibernate.orm.jdbc.extract (6.3+ 'extracted value (1:BIGINT) -> [42]', 6.0–6.2 'extracted value ([1] : [BIGINT]) - [42]'), H5 org.hibernate.type.descriptor.sql.BasicExtractor. Wolne zapytania, logger org.hibernate.SQL_SLOW (INFO): od 5.4.5 klucz hibernate.session.events.log.LOG_QUERIES_SLOWER_THAN_MS, komunikat 'SlowQuery: N milliseconds. SQL: '...''; od 6.2 klucz hibernate.log_slow_query; od 6.3 komunikat 'Slow query took N milliseconds [sql]'. show_sql daje na stdout linie 'Hibernate: select ...' (z highlight_sql: '[Hibernate]' w kolorze). | Hibernate sam z siebie nie tworzy spanów SQL. Robi to instrumentacja JDBC (patrz wpis OTel JDBC); instrumentacja hibernate agenta daje spany Session.*/Transaction.commit. | Bez zmian w kodzie: poziomy loggerów przez zmienne środowiskowe (LOGGING_LEVEL_ORG_HIBERNATE_SQL=DEBUG) albo -D. Właściwości Hibernate najlepiej przez -Dspring.jpa.properties.hibernate.xxx albo SPRING_APPLICATION_JSON: zmienne SPRING_JPA_PROPERTIES_HIBERNATE_... wiążą się z kluczem mapy z podkreśleniami zamienionymi na kropki (format_sql -> format.sql), więc Hibernate ich nie rozpozna. Ze zmianą: własny org.hibernate.resource.jdbc.spi.StatementInspector (hibernate.session_factory.statement_inspector=com.x.FlowInspector) dostaje każdy SQL przed prepare i może go zalogować z MDC albo dokleić komentarz /* flow=reqId */. |
| Hibernate: SQL bez wywołania repozytorium (flush, dirty checking, kaskady, write-behind, Envers) | Metoda @Transactional (lub EJB z TransactionAttributeType.REQUIRED, domyślne w @Stateless) zmienia pola encji pobranej z repozytorium i nie woła save(). Mapowania @OneToMany(cascade=..., orphanRemoval=true), @ManyToMany. @Version (UPDATE ... where version=?). @DynamicUpdate. @Audited (Envers). Generatory: GenerationType.IDENTITY wymusza natychmiastowy INSERT przy persist; SEQUENCE odkłada INSERT do flush i dokłada 'select nextval'. | logging.level.org.springframework.orm.jpa.JpaTransactionManager=DEBUG (komunikaty z AbstractPlatformTransactionManager logowane są loggerem konkretnej klasy menedżera): 'Creating new transaction with name [com.x.OrderService.close]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT', 'Opened new EntityManager [...] for JPA transaction', 'Initiating transaction commit', 'Committing JPA transaction on EntityManager [...]', 'Closing JPA EntityManager after transaction'. Linie org.hibernate.SQL z UPDATE z flushu przy commit pojawiają się PO 'Committing JPA transaction on EntityManager' (doCommit loguje, a potem woła tx.commit(), który robi flush), przed 'Closing JPA EntityManager after transaction' (zweryfikowane w kodzie JpaTransactionManager.doCommit). Hibernate z org.hibernate.event.internal.AbstractFlushingEventListener=DEBUG pisze 'Flushed: N insertions, M updates, K deletions to X objects' i 'Flushed: N (re)creations, M updates, K removals to X collections' (H5–H7). | Przy włączonej instrumentacji hibernate (domyślnie włączona we wszystkich wydaniach 2.x do 2.32; w gałęzi main agenta zmieniona na wyłączoną) spany JDBC UPDATE/INSERT mają rodzica w spanie 'Transaction.commit'; są też spany 'Session.flush', 'Session.merge com.x.Order'. Bez niej spany JDBC wiszą pod spanem nadrzędnym (HTTP/kontroler) po zakończeniu spanu metody serwisu. | Bez zmian: logi JpaTransactionManager (granice transakcji z nazwą metody) przeplecione z org.hibernate.SQL. SQL między 'Creating new transaction with name [X]' a 'Closing JPA EntityManager after transaction' / 'Not closing pre-bound JPA EntityManager after transaction' (tego samego wątku) przypisujemy do X. Ze zmianą: Hibernate Integrator rejestrujący FlushEventListener / PreUpdateEventListener, który loguje encję i zmienione pola. |
| Lazy loading, N+1 i open-in-view: SQL poza warstwą danych | FetchType.LAZY/EAGER (brak atrybutu przy @ManyToOne/@OneToOne oznacza EAGER), @Fetch(FetchMode.SELECT\|SUBSELECT\|JOIN), @BatchSize, hibernate.default_batch_fetch_size, @EntityGraph, 'join fetch' w JPQL, @LazyCollection, @LazyToOne, hibernate.enable_lazy_load_no_trans. Encje zwracane wprost z @RestController (brak DTO). Brak spring.jpa.open-in-view=false w konfiguracji. Lombok @Data/@ToString na encjach z relacjami. | Na starcie (Spring Boot 2.0+): WARN 'spring.jpa.open-in-view is enabled by default. Therefore, database queries may be performed during view rendering. Explicitly configure spring.jpa.open-in-view to disable this warning' (logger org.springframework.boot.autoconfigure.orm.jpa.JpaBaseConfiguration$JpaWebConfiguration; w Spring Boot 4 klasa przeniesiona do modułu spring-boot-jpa, pakiet org.springframework.boot.jpa.autoconfigure). Statystyki: hibernate.generate_statistics=true daje INFO 'Session Metrics { ... N nanoseconds spent preparing M JDBC statements; ... executing M JDBC statements ...}' (logger org.hibernate.engine.internal.StatisticalLoggingSessionEventListener). Gdy OSIV jest wyłączony: LazyInitializationException, dla encji 'could not initialize proxy [com.x.Customer#5] - no Session' (H5–6.2; w H6.6 'no session' małą literą), dla kolekcji 'failed to lazily initialize a collection of role: ..., could not initialize proxy - no Session'. Regex bez rozróżniania wielkości liter. | Spany JDBC SELECT są dziećmi spanu HTTP (albo spanu kontrolera), a nie spanu repozytorium. Seria identycznych spanów 'SELECT schema.table' w jednym trace to N+1. Agent nie oznacza lazy-load osobnym atrybutem. | Bez zmian: p6spy z stacktrace=true i stacktraceclass=com.firma (stos dla SQL pokazuje, która klasa i metoda wywołała lazy-load). Druga opcja to datasource-proxy z listenerem liczącym zapytania na request. Ze zmianą: filtr HTTP wstawiający do MDC fazę requestu (controller / serialization) albo Hibernate LoadEventListener / InitializeCollectionEventListener logujący 'lazy init Encja.kolekcja'. |
| Spring JdbcTemplate / NamedParameterJdbcTemplate / JdbcClient / SimpleJdbcCall | Wywołania jdbcTemplate.query\|queryForObject\|queryForList\|update\|batchUpdate\|execute\|call, namedParameterJdbcTemplate.*, jdbcClient.sql("...").param(...).query(...), new SimpleJdbcCall(ds).withProcedureName("..."), new SimpleJdbcInsert(ds).withTableName("..."), podklasy org.springframework.jdbc.object.StoredProcedure / MappingSqlQuery / SqlUpdate (SQL w konstruktorze), RowMapper / ResultSetExtractor. Tekst SQL bywa w stałej, w pliku .sql (ResourceUtils/ClassPathResource) albo sklejany StringBuilderem. | logging.level.org.springframework.jdbc.core.JdbcTemplate=DEBUG. Komunikaty (zweryfikowane w kodzie): 'Executing SQL query [..]', 'Executing SQL update [..]', 'Executing SQL statement [..]' (zwykły Statement), 'Executing prepared SQL query' / 'Executing prepared SQL update' (bez SQL) i zaraz potem 'Executing prepared SQL statement [..]', 'Executing SQL update and returning generated keys', 'Executing SQL batch update of N statements' (batchUpdate(String...)), 'Executing SQL batch update [..]' (BatchPreparedStatementSetter / List<Object[]>), 'Executing SQL batch update [..] with a batch size of N' (wariant z Collection i batchSize), 'Calling stored procedure [{call x(?)}]'. Na TRACE: 'SQL update affected N rows', 'Sending SQL batch update #i with M items', 'CallableStatement.execute() returned ...'. Parametry: logging.level.org.springframework.jdbc.core.StatementCreatorUtils=TRACE daje 'Setting SQL statement parameter value: column index 1, parameter value [42], value class [java.lang.Long], SQL type unknown'. Ogólnie: org.springframework.jdbc.core=TRACE. | Brak spanu Springa, są tylko spany JDBC CLIENT pod spanem rodzica (patrz wpis OTel JDBC). | Bez zmian: poziomy loggerów. Ze zmianą: podklasa JdbcTemplate jako @Primary z nadpisanym execute(...), który loguje SQL razem z MDC i klasą wywołującą (StackWalker). Inna opcja to dekorator DataSource (datasource-proxy). |
| MyBatis (i iBATIS 2): mappery XML/adnotacje, dynamiczny SQL, logi per statement | XML: <mapper namespace="com.x.OrderMapper"> z <select\|insert\|update\|delete id="..." statementType="CALLABLE\|STATEMENT\|PREPARED">, <sql id> + <include refid>, <resultMap> z <association select="..."> / <collection select="..."> (zagnieżdżone SELECTy, czyli N+1, możliwe fetchType="lazy"). Adnotacje: @Select, @Insert, @Update, @Delete, @SelectProvider(type=..., method=...), @Options. Interfejs @Mapper albo pakiet z @MapperScan; mybatis.mapper-locations=classpath*:mapper/**/*.xml. ${...} oznacza konkatenację (SQL injection, SQL nieparametryzowany). iBATIS 2: sqlMapConfig.xml, <sqlMap namespace>, SqlMapClientTemplate.queryForObject("ns.id", param). | logging.level.com.x.mapper=DEBUG (albo konkretny namespace). Format z BaseJdbcLogger (zweryfikowany w kodzie): '==>  Preparing: select * from orders where id = ?', '==> Parameters: 42(Long), OPEN(String)', '<==      Total: 1', przy update '<==    Updates: 1', dla statementType=STATEMENT '==>  Executing: ...' (SQL z wklejonymi wartościami). Na TRACE: '<==    Columns: ...' i '<==        Row: ...'. Ustawienie mybatis.configuration.log-impl=org.apache.ibatis.logging.stdout.StdOutImpl wypisuje to na stdout bez MDC; logPrefix dodaje prefiks do nazwy loggera. iBATIS 2: loggery java.sql.Connection / java.sql.PreparedStatement na DEBUG ('{pstm-100001} Executing Statement: ...', '{pstm-100001} Parameters: [...]'). | Instrumentacja mybatis-3.2 jest WYŁĄCZONA domyślnie od agenta 2.1.0 (w 1.x i 2.0.0 była włączona; zweryfikowane w kodzie MyBatisInstrumentationModule.defaultEnabled). Włączenie: otel.instrumentation.mybatis.enabled=true. Daje span INTERNAL 'OrderMapper.selectById' (MapperMethod / SqlCommand, CodeSpanNameExtractor) z code.namespace/code.function. Pod nim są spany JDBC. | Bez zmian: poziom DEBUG na pakiecie mapperów. Ze zmianą: interceptor @Intercepts({@Signature(type=StatementHandler.class, method="prepare", args={Connection.class, Integer.class})}) albo na Executor.query/update. Dostaje MappedStatement.getId() i BoundSql.getSql()/getParameterMappings(), więc loguje id statementu, SQL i MDC. Rejestracja: bean Interceptor (Spring Boot) albo <plugins> w mybatis-config.xml. |
| jOOQ i Querydsl SQL: query buildery | jOOQ: pole DSLContext, importy wygenerowanych klas tabel (static import com.x.jooq.Tables.ORDERS), ctx.select(...).from(ORDERS).where(ORDERS.ID.eq(id)).fetch(), ctx.batch(...), Routines.* (wygenerowane procedury), plugin jooq-codegen w pom/gradle. Querydsl: klasy Q* (QOrder.order), JPAQueryFactory.selectFrom(...), SQLQueryFactory, apt-maven-plugin / querydsl-apt. Schemat bazy jest w kodzie (klasy generowane), co ułatwia mapowanie tabel. | jOOQ: logging.level.org.jooq.tools.LoggerListener=DEBUG. Komunikaty (zweryfikowane w kodzie, etykiety wyrównane spacjami do dwukropka): 'Executing query          : select ... where id = ?', '-> with bind values      : select ... where id = 42', 'Calling routine', 'Executing batch query', 'Batch size', 'Fetched result', 'Fetched row(s)           : 1', 'Affected row(s)'. Włączane przez Settings.withExecuteLogging(true) (domyślnie true). Querydsl SQL: logger JUL com.querydsl.sql.AbstractSQLQuery na FINE (znormalizowany SQL), do SLF4J przez SLF4JBridgeHandler; poza tym SQLListener/SQLDetailedListener. Dla forka OpenFeign querydsl 6.x logger nie został sprawdzony. | jOOQ nie ma dedykowanej instrumentacji w agencie, są tylko spany JDBC (albo R2DBC). Interfejs org.jooq.ExecuteListener jest w samym rdzeniu jOOQ (nie w jooq-meta); metryki/obserwacje daje biblioteka zewnętrzna (np. Micrometer). Querydsl: brak spanów własnych. | jOOQ ze zmianą: własny org.jooq.ExecuteListener (DefaultConfiguration.set(new DefaultExecuteListenerProvider(listener))). Ma callbacki renderEnd/executeStart/executeEnd z ctx.sql(), ctx.bindings() i ctx.query(), więc loguje SQL z MDC. Spring Boot podnosi beany ExecuteListenerProvider automatycznie (JooqAutoConfiguration). Querydsl SQL: Configuration.addListener(SQLListener). |
| Proxy sterownika/DataSource: p6spy, datasource-proxy, log4jdbc, WildFly spy | Już obecne w projekcie: URL jdbc:p6spy:..., driver com.p6spy.engine.spy.P6SpyDriver, plik spy.properties; net.ttddyy.dsproxy.support.ProxyDataSourceBuilder; URL jdbc:log4jdbc:..., driver net.sf.log4jdbc.DriverSpy (log4jdbc) / net.sf.log4jdbc.sql.jdbcapi.DriverSpy (log4jdbc-log4j2), log4jdbc.log4j2.properties; w standalone.xml <datasource ... spy="true">. | p6spy: domyślny appender to com.p6spy.engine.spy.appender.FileLogger (plik spy.log w katalogu roboczym procesu!), do SLF4J trzeba ustawić appender=com.p6spy.engine.spy.appender.Slf4JLogger (logger 'p6spy'; starter Spring Boot robi to sam). Domyślny SingleLineFormat (zweryfikowany w kodzie): 'czas\|ms\|category\|connection N\|url jdbc:...\|sql-prepared\|sql-z-wartosciami', albo logMessageFormat=com.p6spy.engine.spy.appender.CustomLineFormat z customLogMessageFormat=%(currentTime)\|%(executionTime)\|%(category)\|connection%(connectionId)\|%(sqlSingleLine); stacktrace=true, stacktraceclass=com.firma; domyślnie excludecategories=info,debug,result,resultset,batch. datasource-proxy: ProxyDataSourceBuilder.create(ds).name("ds").logQueryBySlf4j(SLF4JLogLevel.INFO), logger net.ttddyy.dsproxy.listener.logging.SLF4JQueryLoggingListener: 'Name:ds, Connection:5, Time:1, Success:True, Type:Prepared, Batch:False, QuerySize:1, BatchSize:0, Query:["select ... where id=?"], Params:[(42)]'; .countQuery() / QueryCountHolder do liczenia N+1. log4jdbc: loggery jdbc.sqlonly, jdbc.sqltiming ('select ... {executed in 3 msec}'), jdbc.audit, jdbc.resultset, jdbc.resultsettable, jdbc.connection. WildFly: atrybut spy=true na datasource plus logger jboss.jdbc.spy (DEBUG/TRACE), linie w rodzaju 'java:jboss/datasources/X [PreparedStatement] setLong(1, 42)', '[PreparedStatement] executeQuery()'. | Brak, to alternatywa dla OTel. Jeśli proxy i agent OTel działają razem, powstaje jeden span JDBC na wywołanie: agent instrumentuje każdą implementację java.sql.Statement (także klasy proxy), ale zagnieżdżone spany CLIENT tego samego typu są tłumione, więc zostaje zewnętrzny (na obiekcie proxy). | Bez zmian w kodzie: podmiana URL/drivera w konfiguracji, dorzucenie startera (zmiana zależności) albo w WildFly komenda CLI /subsystem=datasources/data-source=X:write-attribute(name=spy,value=true) plus /subsystem=logging/logger=jboss.jdbc.spy:add(level=TRACE). W app serverach z JNDI: p6spy jako DataSource z realdatasource=java:/jdbc/Real. Ze zmianą: datasource-proxy z własnym QueryExecutionListener (afterQuery) logującym SQL, parametry, czas, MDC i klasę wywołującą z StackWalker. |
| OpenTelemetry: spany JDBC i semconv bazodanowy | -javaagent:opentelemetry-javaagent.jar w skrypcie lub Dockerfile, zmienne OTEL_*; zależność io.opentelemetry.instrumentation:opentelemetry-jdbc (biblioteka: OpenTelemetryDataSource albo URL jdbc:otel:... z driverem io.opentelemetry.instrumentation.jdbc.OpenTelemetryDriver); Quarkus: quarkus.datasource.jdbc.telemetry=true. | Bez backendu można włączyć logging exporter (otel.traces.exporter=logging, w nowszych wersjach także console) i parsować log. Agent wstrzykuje trace_id/span_id do MDC (logback/log4j), więc linie org.hibernate.SQL czy JdbcTemplate dają się skorelować z trace. | Nazwa spanu: stary semconv '{db.operation} {db.name}.{tabela}', np. 'SELECT shop.orders'; nowy kod (main) bierze podsumowanie zapytania (db.query.summary), dla batcha 'BATCH ' + podsumowanie (np. 'BATCH INSERT orders'), dla pustego batcha samo 'BATCH', fallback do db.system.name. Stare atrybuty: db.system, db.statement, db.operation, db.sql.table, db.name, db.user, db.connection_string. Nowe (otel.semconv-stability.opt-in=database albo database/dup dla obu): db.system.name, db.query.text, db.query.summary, db.operation.name, db.collection.name, db.namespace, db.stored_procedure.name, db.operation.batch.size, db.response.status_code, server.address/port, error.type. Klucze (zweryfikowane w README jdbc dla tagów): sanityzacja otel.instrumentation.jdbc.statement-sanitizer.enabled (do ok. 2.25) przemianowana na otel.instrumentation.jdbc.query-sanitization.enabled (od ok. 2.28; domyślnie true), analogicznie klucz common; otel.instrumentation.jdbc.experimental.capture-query-parameters=true (od 2.16; atrybuty db.query.parameter.<klucz>, wyłącza sanityzację); otel.instrumentation.jdbc.experimental.transaction.enabled=true (od 2.16; spany COMMIT/ROLLBACK); otel.instrumentation.jdbc.experimental.sqlcommenter.enabled=true (od 2.21; komentarz traceparent w SQL); otel.instrumentation.jdbc-datasource.enabled=true (spany DataSource.getConnection, domyślnie wyłączone). Hibernate: instrumentacja hibernate-3.3/4.0/6.0 jest WŁĄCZONA domyślnie we wszystkich wydaniach do 2.32.0; w gałęzi main zmieniona na defaultEnabled=false (przyszłe wydanie), sterowanie otel.instrumentation.hibernate.enabled. Spany 'Session.find com.x.Order', 'Session.merge ...', 'Transaction.commit', nazwa zapytania z podsumowania HQL/SQL albo fallback 'hibernate'; atrybut hibernate.session_id przy otel.instrumentation.hibernate.experimental-span-attributes=true. Osobny moduł hibernate-procedure-call-4.3: 'ProcedureCall.getOutputs <proc>'. MyBatis domyślnie wyłączony od 2.1.0. R2DBC i Vert.x SQL Client mają własne spany CLIENT. | Bez zmian: agent z flagami powyżej (dobranymi do wersji). sqlcommenter dokleja do SQL /*traceparent='00-...'*/, co pozwala połączyć log bazy z trace. Ze zmianą: @WithSpan na metodach DAO, żeby JDBC miało właściwego rodzica. |
| Procedury składowane, funkcje, triggery i widoki: logika po stronie bazy | @NamedStoredProcedureQuery, em.createStoredProcedureQuery("name"), @Procedure(procedureName=...), new SimpleJdbcCall(...).withProcedureName / withFunctionName / withCatalogName (pakiety Oracle), extends org.springframework.jdbc.object.StoredProcedure, connection.prepareCall("{call x(?,?)}") / "{? = call f(?)}", 'begin pkg.proc(?); end;' (Oracle PL/SQL blok), <select statementType="CALLABLE"> w MyBatis, @Subselect("select ..."), @Table(name="v_orders") z @Immutable, @Formula("(select count(*) ...)"), @SQLRestriction("deleted=false") (H6.3+) / @Where (starsze), @SQLDelete(sql="update ... set deleted=true where id=?"). Po stronie bazy: migracje Flyway/Liquibase (CREATE TRIGGER, CREATE VIEW, CREATE PROCEDURE/FUNCTION) w db/migration/*.sql i changelog*.xml. | JdbcTemplate: 'Calling stored procedure [{call x(?, ?)}]'; org.hibernate.SQL: '{call x(?,?)}'; MyBatis: '==>  Preparing: {call x(?,?)}'. Wnętrze procedury widać tylko w logu bazy (PostgreSQL log_statement nie loguje SQL z wnętrza funkcji; potrzebne auto_explain.log_nested_statements=on albo pg_stat_statements.track=all; Oracle: trace 10046 / DBMS_MONITOR). | Span CALL z db.stored_procedure.name (nowy semconv) albo db.statement='{call proc(?)}'. Blok 'begin ... end' daje span o nazwie opartej na operacji albo fallback db.system. Triggery i wnętrze procedury nie dają żadnego spanu. | Bez zmian: w PostgreSQL pg_stat_statements.track=all i auto_explain.log_nested_statements=on. Ze zmianą: statycznie sparsować migracje i źródła procedur (pg_proc.prosrc, ALL_SOURCE w Oracle, sys.sql_modules w SQL Server), żeby dodać krawędzie procedura->tabela oraz trigger: tabela->tabela. |
| Batch: JDBC addBatch, Hibernate jdbc.batch_size, przepisywanie przez sterownik | addBatch()/executeBatch()/executeLargeBatch(), jdbcTemplate.batchUpdate(...), hibernate.jdbc.batch_size / spring.jpa.properties.hibernate.jdbc.batch_size, hibernate.order_inserts / order_updates, ctx.batch(...) / batchInsert w jOOQ, JdbcBatchItemWriter / chunk(N) w Spring Batch, parametry URL rewriteBatchedStatements=true, reWriteBatchedInserts=true. Encje z GenerationType.IDENTITY wyłączają batching INSERTów w Hibernate. | Hibernate: N linii org.hibernate.SQL, a statystyki (generate_statistics) pokazują 'N nanoseconds spent executing K JDBC batches'. Logger batcha: H5 org.hibernate.engine.jdbc.batch.internal.BatchingBatch=DEBUG ('Executing batch size: N'); H6 (BatchImpl) logger org.hibernate.orm.jdbc.batch=TRACE: 'Created Batch (N) - `key`', 'Adding to JDBC batch (i) - `key`', 'Executing JDBC batch (i / N) - `key`' (zweryfikowane w kodzie 6.6). JdbcTemplate: 'Executing SQL batch update [..]' / '... with a batch size of N' / 'Executing SQL batch update of N statements' i TRACE 'Sending SQL batch update #i with M items'. jOOQ: 'Executing batch query' i 'Batch size'. datasource-proxy: 'Batch:True, ... BatchSize:N'. p6spy: kategoria 'batch' (domyślnie wykluczona) i wpis 'statement' przy executeBatch. MySQL: profileSQL=true w URL loguje to, co faktycznie poszło (po rewrite). | Agent: span 'BATCH INSERT orders' (gdy batch ma jeden kształt SQL) z db.operation.batch.size=N (nowy semconv); batch o rozmiarze 1 raportowany jako zwykłe zapytanie. Dla mieszanego batcha (Statement.addBatch z różnymi SQL) nazwa z podsumowania wielu zapytań albo ogólna, a db.query.text zawiera kilka zapytań. | Bez zmian: datasource-proxy albo p6spy, które logują flagę batch i rozmiar. Ze zmianą: nic więcej nie trzeba. |
| Log po stronie bazy i korelacja z requestem | URL i właściwości: pgjdbc ApplicationName=..., Hikari spring.datasource.hikari.data-source-properties.ApplicationName; Oracle v$session.module/action ustawiane przez OracleConnection.setClientInfo("OCSID.MODULE", ...) / DBMS_APPLICATION_INFO; SQL Server applicationName w URL; MySQL connectionAttributes=program_name:app. | PostgreSQL: log_statement='all' (none\|ddl\|mod\|all), log_min_duration_statement=0, log_line_prefix='%m [%p] %a %u@%d ' (%a = application_name, %p = pid). Przy protokole rozszerzonym format to 'LOG:  execute <unnamed>: select ... where id=$1' i 'DETAIL:  parameters: $1 = '42''; po prepareThreshold (domyślnie 5) wykonań tego samego statementu pgjdbc przechodzi na nazwany statement serwerowy: 'execute S_3: ...'. log_parameter_max_length (PG13+). pg_stat_statements daje zapytania znormalizowane, bez parametrów. MySQL: SET GLOBAL general_log=ON, log_output='TABLE' (mysql.general_log) lub FILE; slow_query_log=ON, long_query_time=0; performance_schema.events_statements_history_long. Oracle: DBMS_MONITOR.SESSION_TRACE_ENABLE(sid, serial#, waits=>TRUE, binds=>TRUE) (event 10046, tkprof), V$SQL / V$SQL_BIND_CAPTURE. SQL Server: Extended Events sqlserver.rpc_completed / sql_batch_completed z polami client_app_name, session_id. | Opcjonalnie sqlcommenter: komentarz /*traceparent='00-<traceId>-<spanId>-01'*/ w tekście SQL, widoczny w logu bazy i w pg_stat_activity.query (otel.instrumentation.jdbc.experimental.sqlcommenter.enabled=true, agent 2.21+). | Bez zmian w kodzie aplikacji: konfiguracja bazy plus ApplicationName w URL. Ze zmianą: Hibernate StatementInspector albo listener datasource-proxy dokleja '/* req=<traceId> flow=<Klasa.metoda> */'. Hibernate nie wycina takich komentarzy (hibernate.use_sql_comments=true dodaje własne komentarze HQL); pgjdbc i MySQL przekazują komentarze do logu. |
| Logowanie na poziomie sterownika JDBC | Wersja sterownika w zależnościach (org.postgresql:postgresql, com.mysql:mysql-connector-j / mysql:mysql-connector-java, com.oracle.database.jdbc:ojdbc8/11, com.microsoft.sqlserver:mssql-jdbc). Plik logging.properties albo -Djava.util.logging.config.file. Parametry URL: profileSQL, logger, loggerLevel, loglevel (stary pgjdbc). | pgjdbc 42.0.0+: logger JUL 'org.postgresql' na FINE/FINEST (parametry URL loggerLevel/loggerFile są wciąż w PGProperty, ale zalecane jest konfigurowanie JUL); z mostkiem jul-to-slf4j logging.level.org.postgresql=TRACE. Komunikaty FINEST z QueryExecutorImpl (zweryfikowane w kodzie): '  simple execute, handler=..., maxRows=0, fetchSize=0, flags=...', ' FE=> Parse(stmt=null,query="select ...",oids={20})', ' FE=> Bind(stmt=null,portal=null,$1=<'42'>,type=INT8)', ' FE=> Execute(portal=null,limit=0)'. MySQL Connector/J: URL profileSQL=true&logger=Slf4JLogger (8.x com.mysql.cj.log.Slf4JLogger, 5.1 com.mysql.jdbc.log.Slf4JLogger), logger 'MySQL'; format zdarzeń profilera ('[QUERY] ...') różni się między 5.1 a 8.x, wymaga testu; logSlowQueries=true&slowQueryThresholdMillis=N. Oracle: ojdbc*_g.jar (wersja debug), -Doracle.jdbc.Trace=true, logger JUL 'oracle.jdbc' (np. oracle.jdbc.level=FINE). SQL Server: logger JUL 'com.microsoft.sqlserver.jdbc' / com.microsoft.sqlserver.jdbc.internals.SQLServerStatement na FINE/FINER. | brak | Bez zmian w kodzie: URL plus konfiguracja JUL. Spring Boot z logback instaluje SLF4JBridgeHandler; poziom JUL trzeba mieć ustawiony na FINEST (sterownik sprawdza isLoggable), w razie potrzeby LevelChangePropagator albo logging.properties. Ze zmianą: nie trzeba. |
| Java EE / Jakarta EE: JPA w kontenerze (EclipseLink, OpenJPA, Hibernate w WildFly), EJB/JTA, JNDI DataSource | @Stateless/@Stateful/@Singleton/@MessageDriven z @PersistenceContext(unitName=...) EntityManager; @TransactionAttribute(REQUIRED\|REQUIRES_NEW\|NOT_SUPPORTED); @TransactionManagement(BEAN) + UserTransaction; @Resource(lookup="java:/jdbc/X") DataSource; META-INF/persistence.xml: <provider> (org.eclipse.persistence.jpa.PersistenceProvider / org.hibernate.jpa.HibernatePersistenceProvider / org.apache.openjpa.persistence.PersistenceProviderImpl), <jta-data-source>, transaction-type="JTA"; ejb-jar.xml; orm.xml z <named-query>. Brak <provider> oznacza domyślnego dostawcę serwera. | EclipseLink w persistence.xml: <property name="eclipselink.logging.level" value="FINE"/> albo tylko kategoria <property name="eclipselink.logging.level.sql" value="FINE"/>; parametry jawnie <property name="eclipselink.logging.parameters" value="true"/> (domyślne wyświetlanie bind parameters zależy od wersji, nie polegać na nim). Komunikat '[EL Fine]: sql: ...--SELECT ID, STATUS FROM ORDERS WHERE (ID = ?)' z kolejną linią '\tbind => [42]' (format z dokumentacji, niesprawdzony na konkretnej wersji serwera). OpenJPA: <property name="openjpa.Log" value="SQL=TRACE"/> i openjpa.ConnectionFactoryProperties=PrintParameters=true ('executing prepstmnt NNN SELECT ... [params=(long) 42]'). Hibernate w WildFly: kategoria org.hibernate.SQL w subsystemie logging. WildFly JDBC: spy=true plus logger jboss.jdbc.spy. Transakcje: com.arjuna (Narayana) na DEBUG/TRACE. | Agent instrumentuje JDBC niezależnie od dostawcy JPA (spany CLIENT). Hibernate ma spany przy włączonej instrumentacji hibernate; EclipseLink/OpenJPA nie mają instrumentacji. JAX-RS, JAX-WS, EJB (opcjonalnie) i JMS/MDB dają spany wejścia. | Bez zmian w kodzie: właściwości w persistence.xml (to zmiana pliku konfiguracyjnego w archiwum) albo spy/logger w konfiguracji serwera przez CLI. Ze zmianą: EJB @Interceptors / @AroundInvoke na beanach DAO, a dla EclipseLink SessionEventListener (preExecuteQuery/postExecuteQuery) przez eclipselink.session-event-listener. |
| Spring 2.5–4 z XML i stare szablony DAO (HibernateTemplate, JdbcDaoSupport, transakcje AOP w XML) | applicationContext*.xml / *-dao.xml: <bean id="orderDao" class="com.x.OrderDaoImpl"><property name="sessionFactory" ref="sessionFactory"/>, class="org.springframework.orm.hibernate3.LocalSessionFactoryBean" lub AnnotationSessionFactoryBean (hibernate4/5: org.springframework.orm.hibernate4/5.LocalSessionFactoryBean), <property name="mappingResources"> z *.hbm.xml, <tx:advice> z <tx:method name="save*" propagation="REQUIRED"/>, <aop:config><aop:pointcut expression="execution(* com.x.service.*.*(..))"/>, TransactionProxyFactoryBean z transactionAttributes. W Javie: extends HibernateDaoSupport (getHibernateTemplate().find("from Order where ...")), extends JdbcDaoSupport (getJdbcTemplate()), extends SqlMapClientDaoSupport. *.hbm.xml: <class name table>, <set lazy> / <many-to-one fetch>, <sql-query name>, <query name>. | Logi Hibernate 3: log4j.logger.org.hibernate.SQL=DEBUG, log4j.logger.org.hibernate.type=TRACE. Format parametrów zależy od wersji (zweryfikowane w kodzie): H3.5 i starsze 'binding '42' to parameter: 1' (NullableType), H3.6 'binding parameter [1] as [BIGINT] - 42' (BasicBinder, bez nawiasów, null jako '<null>'), H4.3 'binding parameter [1] as [BIGINT] - [42]'. Transakcje: org.springframework.orm.hibernate3.HibernateTransactionManager=DEBUG ('Creating new transaction with name [com.x.OrderServiceImpl.save]'). Konfiguracja w log4j.properties / log4j.xml. | Tylko spany JDBC i ewentualnie HTTP (servlet). Hibernate 3.3+ jest w zakresie agenta (moduł hibernate-3.3, domyślnie włączony w wydaniach 2.x). | Bez zmian w kodzie: dopisanie loggerów w log4j.properties i ewentualnie p6spy jako driverClassName w beanie dataSource (zmiana XML). Ze zmianą: dodatkowy <aop:aspect> z pointcutem na bean(*Dao) logujący wejście i wyjście. |
| Reaktywny dostęp do danych (R2DBC, Hibernate Reactive, Vert.x SQL) i Micronaut Data | Zależności io.r2dbc:*, org.springframework.data:spring-data-r2dbc, R2dbcEntityTemplate, DatabaseClient.sql("..."), interfejsy ReactiveCrudRepository/R2dbcRepository; org.hibernate.reactive (Mutiny.SessionFactory, Stage.SessionFactory); io.vertx.mutiny.pgclient.PgPool / Pool.preparedQuery("..."); Micronaut: @JdbcRepository / @R2dbcRepository, a po kompilacji w build/classes klasy $...Repository$Intercepted / $...Definition z metadanymi @DataMethod / @Query("SELECT ...") zawierającymi gotowy SQL (wystarczy przeszukać stringi w bytecode). | Spring R2DBC: logging.level.org.springframework.r2dbc.core=DEBUG ('Executing SQL statement [select ...]', DefaultDatabaseClient). r2dbc-proxy (io.r2dbc:r2dbc-proxy, URL r2dbc:proxy:postgresql://...) daje listener z QueryExecutionInfo. Micronaut Data: logger io.micronaut.data.query (DataSettings.QUERY_LOG), DEBUG 'Executing Query: SELECT ...' albo 'Executing SQL query: ...', TRACE 'Binding parameter at position N to value V with data type: T' (zweryfikowane w kodzie). Quarkus reactive: quarkus.hibernate-orm.log.sql=true działa też dla Hibernate Reactive. | Agent ma instrumentację r2dbc-1.0 (spany CLIENT z db.statement / db.query.text) i vertx-sql-client-4.0. Hibernate Reactive ma osobny moduł (hibernate-reactive-1.0). Kontekst propaguje Reactor (instrumentacja reactor-3.1); bez niej spany są osierocone. | Bez zmian: poziomy loggerów i r2dbc-proxy w URL. Ze zmianą: ProxyExecutionListener (r2dbc-proxy) albo Hooks.enableAutomaticContextPropagation() (Reactor 3.5.3+) z Micrometer context-propagation, żeby MDC trafiało do logów SQL. |
| Aplikacje bez bazy relacyjnej lub z bazą 'obok' (NoSQL, cache, pliki, zdalne API) | Brak spring-boot-starter-jdbc/data-jpa i sterowników JDBC; spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration albo @SpringBootApplication(exclude=DataSourceAutoConfiguration.class). Interfejs repozytorium extends MongoRepository / ReactiveMongoRepository / ElasticsearchRepository / KeyValueRepository; encje z @Document / @RedisHash zamiast @Entity / @Table. Uwaga: interfejs CrudRepository jest wspólny dla wszystkich modułów, o rodzaju decyduje moduł i adnotacja encji (strict repository configuration mode). | Start Spring Boot z bazą: 'HikariPool-1 - Starting...' / 'HikariPool-1 - Start completed.' (com.zaxxer.hikari.HikariDataSource, INFO); 'H2 console available at ...' przy włączonej konsoli H2; 'Multiple Spring Data modules found, entering strict repository configuration mode' (logger org.springframework.data.repository.config.RepositoryConfigurationDelegate, INFO). MongoDB: logging.level.org.mongodb.driver.protocol.command=DEBUG; MongoTemplate: org.springframework.data.mongodb.core.MongoTemplate=DEBUG ('find using query: { ... } ... in collection: orders'). | MongoDB: spany CLIENT '<operacja> <baza>.<kolekcja>' (np. 'find shop.orders') z db.system=mongodb (stare: db.mongodb.collection, db.statement z JSON). Redis (lettuce/jedis): 'GET', db.system=redis. Elasticsearch: spany HTTP lub elasticsearch-*. Zero spanów z db.system SQL przy działającej instrumentacji to sygnał braku bazy relacyjnej. | Bez zmian: sprawdzić log startowy pod kątem Hikari / strict mode i zrobić inwentarz zależności. Ze zmianą: nie trzeba. |
| Przypisanie SQL do metody i requestu: granice transakcji i MDC jako szkielet | @Transactional (propagation REQUIRES_NEW tworzy osobną transakcję i osobne połączenie), TransactionTemplate.execute, @EnableTransactionManagement(mode=PROXY\|ASPECTJ), bean PlatformTransactionManager, TransactionSynchronizationManager.registerSynchronization / @TransactionalEventListener; wejścia: @KafkaListener, @RabbitListener, @JmsListener, @Scheduled, implements org.quartz.Job, @MessageDriven, Spring Integration @ServiceActivator, Axon @CommandHandler/@EventHandler (Axon zapisuje też do własnych tabel domain_event_entry, token_entry, saga_entry). | logging.level.org.springframework.transaction=TRACE i org.springframework.orm.jpa=DEBUG (albo org.springframework.jdbc.support.JdbcTransactionManager / org.springframework.jdbc.datasource.DataSourceTransactionManager=DEBUG; komunikaty idą loggerem konkretnej klasy menedżera). Komunikaty: 'Creating new transaction with name [com.x.OrderService.place]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT', 'Participating in existing transaction', 'Suspending current transaction, creating new transaction with name [...]', 'Acquired Connection [HikariProxyConnection@123 wrapping org.postgresql.jdbc.PgConnection@456] for JDBC transaction', 'Initiating transaction commit', 'Initiating transaction rollback'. TransactionInterceptor na TRACE: 'Getting transaction for [com.x.OrderService.place]' / 'Completing transaction for [...]'. Axon: org.axonframework.eventsourcing.eventstore.jpa / org.hibernate.SQL na domain_event_entry. | Spring nie tworzy spanu transakcji (Micrometer Observation ma tylko spany wejść). Agent ma eksperymentalnie spany JDBC COMMIT/ROLLBACK (otel.instrumentation.jdbc.experimental.transaction.enabled=true, od 2.16). | Bez zmian: logback pattern z %X{traceId} %thread plus loggery transakcji. Ze zmianą: jeden aspekt @Around na wejściach (@KafkaListener, @Scheduled, Job.execute, @RestController) ustawiający MDC flow.entry=Klasa.metoda i flow.id=UUID; logi SQL z dowolnego źródła (Hibernate, JdbcTemplate, p6spy) dziedziczą MDC w tym samym wątku. |
| SQL infrastruktury frameworków (Spring Batch, Quartz, Spring Session JDBC, Spring Integration JDBC, ShedLock, Flyway/Liquibase) | Zależności spring-batch-core (@EnableBatchProcessing, JobRepository, tabele BATCH_*), org.quartz-scheduler (org.quartz.jobStore.class=org.quartz.impl.jdbcjobstore.JobStoreTX / spring.quartz.job-store-type=jdbc, tabele QRTZ_*), spring-session-jdbc (@EnableJdbcHttpSession, spring.session.store-type=jdbc, tabele SPRING_SESSION*), spring-integration-jdbc (JdbcMessageStore, JdbcChannelMessageStore, JdbcPollingChannelAdapter / <int-jdbc:inbound-channel-adapter query=...>, JdbcLockRegistry, tabele INT_*), net.javacrumbs.shedlock (@SchedulerLock, tabela shedlock), Flyway (db/migration/V*__*.sql, spring.flyway.*), Liquibase (db.changelog-master.*). | Spring Batch, Spring Session JDBC i Spring Integration JDBC używają JdbcTemplate, więc ich SQL widać pod org.springframework.jdbc.core.JdbcTemplate=DEBUG. Quartz używa własnego JDBC (StdJDBCDelegate) i SQL nie loguje; logger org.quartz.impl.jdbcjobstore na DEBUG pokazuje pozyskiwanie blokad (komunikaty o 'TRIGGER_ACCESS' / 'STATE_ACCESS', treść do weryfikacji). Flyway (org.flywaydb, INFO): 'Migrating schema ... to version ...', 'Successfully applied N migrations'. Liquibase: 'ChangeSet ... ran successfully'. | Spany JDBC jak każde inne; Spring Batch od 5.x ma własne obserwacje Micrometer (job/step). Spany JDBC z tabel BATCH_*, QRTZ_*, SPRING_SESSION*, INT_*, shedlock, flyway_schema_history / DATABASECHANGELOG rozpoznawać po db.sql.table / db.collection.name. | Bez zmian: lista tabel infrastruktury jako filtr w parserze; proxy JDBC pokazuje też SQL Quartza. Ze zmianą: nie trzeba. |
| EJB 2.x CMP/BMP i J2EE sprzed JPA | implements javax.ejb.EntityBean, abstract getX()/setX() bez pól, metody ejbCreate/ejbPostCreate/ejbLoad/ejbStore/ejbRemove/ejbFindBy*/ejbSelect*; ejb-jar.xml: <entity><persistence-type>Container\|Bean</persistence-type>, <cmp-field>, <query><ejb-ql>SELECT OBJECT(o) FROM Order o WHERE ...</ejb-ql>, <ejb-relation>; deskryptory dostawcy: jbosscmp-jdbc.xml (JBoss), weblogic-cmp-rdbms-jar.xml (WebLogic), ibm-ejb-jar-ext.xmi / Map.mapxmi (WebSphere). Interfejsy *Home / *LocalHome z findByX. | Zależne od serwera; JBoss 3/4: kategoria org.jboss.ejb.plugins.cmp na DEBUG loguje generowany SQL ('Executing SQL: ...', do weryfikacji na konkretnej wersji). Pozostałe serwery: flagi debug CMP dostawcy albo proxy/spy na DataSource. Często jedyną pewną drogą jest log bazy. | Tylko spany JDBC (o ile agent obsługuje wersję JVM i sterownika; bardzo stare JVM 1.4/5 są poza zakresem agenta, minimum Java 8). | Bez zmian w kodzie: logger kontenera, p6spy jako DataSource w konfiguracji serwera, log bazy. Ze zmianą: praktycznie nierealne (kod generowany przez kontener przy deploy). |
| Inne mappery i ORM spotykane w legacy: Jdbi, Ebean, Commons DbUtils, Cayenne, natywne API Hibernate | Jdbi: org.jdbi.v3.core.Jdbi / Handle, interfejsy z @SqlQuery / @SqlUpdate (SQL Object), pliki .sql przy @UseClasspathSqlLocator; Jdbi 2: org.skife.jdbi.v2. Ebean: io.ebean.DB / Database, DB.find(Order.class).where()...; starsze com.avaje.ebean. DbUtils: new QueryRunner(ds).query(sql, handler, params). Cayenne: ObjectContext, ObjectSelect, cayenne-project.xml. Hibernate: session.createCriteria(...) (H3–5), session.createSQLQuery / createNativeQuery, session.doWork(conn -> ...). | Jdbi 3: domyślnie brak logów SQL (NOP SqlLogger); po jdbi.setSqlLogger(new Slf4JSqlLogger()) logger 'org.jdbi.sql' na DEBUG, komunikat 'Executed in <czas> '<sql>' with parameters '<params>'' (zweryfikowane w kodzie). Ebean: logger io.ebean.SQL (DEBUG, SQL z bind), io.ebean.TXN, io.ebean.SUM (z dokumentacji; w starszych wersjach prefiks org.avaje.ebean). DbUtils: brak logowania (tylko proxy JDBC). Cayenne: logger org.apache.cayenne.log.JdbcEventLogger (do weryfikacji wersji). Hibernate natywne: org.hibernate.SQL jak zwykle, poza doWork (surowy JDBC, widać tylko w proxy/OTel). | Tylko spany JDBC (agent nie ma instrumentacji tych bibliotek; Hibernate Session API jest objęte instrumentacją hibernate). | Bez zmian: proxy JDBC (p6spy/datasource-proxy) albo OTel. Ze zmianą: Jdbi setSqlLogger z własną implementacją (MDC, klasa wywołująca), Ebean własny SpiLogger/QueryListener. |

### Wyjątki i ich wpływ na przebieg

**Statyczne rozpoznanie warstwy danych (nie tylko *Repository)**

- Repozytorium Spring Data to JDK proxy nad interfejsem; implementacja to SimpleJpaRepository / SimpleJdbcRepository plus QueryExecutorMethodInterceptor
  - Jak rozpoznać: Na stosie widać jdk.proxyN.$ProxyNN (Java 16+) albo com.sun.proxy.$ProxyNN (Java 8–15) i SimpleJpaRepository, a nie nazwę interfejsu. Pointcut within(@Repository *) nie łapie interfejsów bez @Repository
  - Wpływ: Aspekt musi używać this(org.springframework.data.repository.Repository+) albo execution(* org.springframework.data.repository.Repository+.*(..)), inaczej warstwa danych 'znika' z przebiegu
- *Repository / *Dao bez bazy (klient REST, MongoTemplate, Redis, mapa w pamięci)
  - Jak rozpoznać: Brak pól typu DataSource/EntityManager/JdbcTemplate; są RestTemplate, WebClient, FeignClient, MongoTemplate, RedisTemplate
  - Wpływ: Węzeł należy oznaczyć jako 'dostęp do zasobu zewnętrznego', a nie jako SQL
- Active record (Panache, statyczne metody encji, Spring Roo, Ebean Model)
  - Jak rozpoznać: Encja dziedziczy po PanacheEntity / PanacheEntityBase / io.ebean.Model albo ma statyczne finder-y
  - Wpływ: Dostęp do danych wychodzi z klasy encji; nie ma osobnej warstwy repozytorium
- Fragment repozytorium (custom implementation) to zwykła klasa z EntityManager/JdbcTemplate, wpięta w proxy repozytorium bez jawnego wywołania w kodzie
  - Jak rozpoznać: Klasa XxxRepositoryImpl / XxxCustomImpl implementująca interfejs fragmentu, który rozszerza interfejs repozytorium
  - Wpływ: Graf wywołań kończy się na interfejsie repozytorium; krawędź do *Impl trzeba dodać z konwencji nazw (postfix Impl), a nie z wywołań

**Spring Data: zapytania pochodne, @Query, nazwane, Specification, Querydsl**

- Derived deleteBy... / removeBy... najpierw robi SELECT, potem EntityManager.remove dla każdego wiersza, co daje N DELETE i kaskady
  - Jak rozpoznać: Metoda deleteBy* bez @Modifying @Query
  - Wpływ: Jedno wywołanie metody to wiele SQL, w tym DELETE na tabelach zależnych przez cascade
- save() na encji z nadanym id (nie-null, bez @Version typu wrapper, bez Persistable) wywołuje merge, czyli najpierw SELECT, potem INSERT/UPDATE
  - Jak rozpoznać: SimpleJpaRepository.save -> entityInformation.isNew(); id przypisane ręcznie
  - Wpływ: Nieoczekiwany SELECT przed zapisem
- Spring Data REST: repozytorium z @RepositoryRestResource (albo każde wyeksportowane domyślnie) jest samo punktem wejścia HTTP, bez kontrolera
  - Jak rozpoznać: Zależność spring-boot-starter-data-rest; @RepositoryRestResource; spring.data.rest.base-path
  - Wpływ: Przebieg wygląda tak: HTTP -> RepositoryEntityController -> repozytorium. Analiza szukająca @RestController go nie znajdzie
- Pageable dokłada zapytanie COUNT; @Query z JOIN FETCH i Pageable rzuca błąd przy wyprowadzaniu count albo stronicuje w pamięci (H6: 'HHH90003004: firstResult/maxResults specified with collection fetch; applying in memory', H5: HHH000104; z hibernate.query.fail_on_pagination_over_collection_fetch=true wyjątek). Native @Query z Pageable wymaga countQuery
  - Jak rozpoznać: Parametr Pageable, typ zwracany Page<T>
  - Wpływ: Dwa SQL zamiast jednego albo pełny odczyt tabeli
- Spring Data JDBC: save() agregatu z kolekcją @MappedCollection przy aktualizacji usuwa wszystkie encje podrzędne i wstawia je od nowa
  - Jak rozpoznać: spring-data-jdbc w zależnościach, encja z List/Set encji podrzędnych, save() na istniejącym agregacie
  - Wpływ: Jedno save to UPDATE korzenia + DELETE wszystkich dzieci + N INSERT; brak lazy loadingu (cały agregat ładowany od razu)

**Hibernate: logowanie SQL i parametrów (3.x, 4/5, 6.0–6.2, 6.3+)**

- Spring Boot 3 z Hibernate 6: stary logger BasicBinder nic nie wypisuje
  - Jak rozpoznać: hibernate-core 6.x, a w konfiguracji logging.level.org.hibernate.type=TRACE lub org.hibernate.type.descriptor.sql=TRACE
  - Wpływ: SQL widać, ale bez parametrów. Trzeba przejść na org.hibernate.orm.jdbc.bind
- Hibernate 6.0–6.2 (np. Spring Boot 3.0/3.1) ma już nowy logger, ale stary format komunikatu; regex dla 6.3+ nic nie dopasuje
  - Jak rozpoznać: hibernate-core 6.0.x–6.2.x; linie 'binding parameter [1] as [...] - [...]' pod loggerem org.hibernate.orm.jdbc.bind
  - Wpływ: Parser musi wybierać regex po wersji, a nie po nazwie loggera
- Batching: przy hibernate.jdbc.batch_size org.hibernate.SQL loguje każdy statement osobno, a wykonanie idzie jednym executeBatch
  - Jak rozpoznać: spring.jpa.properties.hibernate.jdbc.batch_size>0; statystyki pokazują 'executing N JDBC batches'
  - Wpływ: Liczba wierszy w logu nie równa się liczbie round-tripów do bazy
- Jednoczesne show_sql=true i org.hibernate.SQL=DEBUG
  - Jak rozpoznać: Każdy SQL dwa razy: raz z prefiksem 'Hibernate:' na stdout, raz w logu
  - Wpływ: Fałszywe podwojenie zapytań przy liczeniu N+1
- Hibernate 3.x w aplikacji: format parametrów zależy od wersji 3.5 / 3.6
  - Jak rozpoznać: hibernate3.jar / hibernate-core 3.x; log4j.logger.org.hibernate.type=TRACE
  - Wpływ: Regex dla H5 ('- [42]') nie łapie H3.6 ('- 42') ani H3.5 ('binding '42' to parameter: 1')

**Hibernate: SQL bez wywołania repozytorium (flush, dirty checking, kaskady, write-behind, Envers)**

- Brak save() w kodzie, a UPDATE wykonuje się
  - Jak rozpoznać: Encja zarządzana zmieniona setterem w metodzie @Transactional
  - Wpływ: Analiza statyczna szukająca wywołań repozytorium przeoczy zapis
- readOnly=true w Spring z HibernateJpaDialect ustawia FlushMode.MANUAL (i Session.setDefaultReadOnly), więc zmiany nie lecą do bazy
  - Jak rozpoznać: @Transactional(readOnly = true), JpaTransactionManager z Hibernate
  - Wpływ: Setter w takiej metodzie nie generuje SQL
- readOnly działa tylko na transakcji, którą metoda zaczyna; metoda readOnly uczestnicząca w istniejącej transakcji RW (PROPAGATION_REQUIRED) nie zmienia flush mode
  - Jak rozpoznać: 'Participating in existing transaction' w logu dla metody readOnly
  - Wpływ: Setter w metodzie 'readOnly' jednak daje UPDATE przy commit zewnętrznej transakcji
- Zapytanie wywołuje auto-flush przed SELECT
  - Jak rozpoznać: UPDATE w logu bezpośrednio przed SELECT, w środku metody
  - Wpływ: Kolejność SQL inna niż kolejność wywołań w kodzie
- Hibernate Envers: przy flush dochodzą INSERT do <tabela>_AUD i REVINFO
  - Jak rozpoznać: hibernate-envers w zależnościach, @Audited na encjach
  - Wpływ: Dodatkowe tabele w przebiegu, których żadna klasa domenowa nie wymienia
- Przy OSIV EntityManager jest pre-bound i nie zamyka się po transakcji; zmiany po commit (w kontrolerze) nie lecą do bazy, chyba że późniejsza transakcja w tym samym requeście zrobi flush
  - Jak rozpoznać: 'Not closing pre-bound JPA EntityManager after transaction' w logu
  - Wpływ: UPDATE może pojawić się w drugiej transakcji tego samego requestu, przypisany do innej metody

**Lazy loading, N+1 i open-in-view: SQL poza warstwą danych**

- Hibernate 2nd-level cache albo query cache: lazy-load bez SQL
  - Jak rozpoznać: @Cacheable/@Cache na encji, hibernate.cache.use_second_level_cache=true
  - Wpływ: Raz SQL jest, raz go nie ma; przebieg zależy od stanu cache
- Cache pierwszego poziomu (persistence context): drugi findById / dostęp do tej samej encji w tej samej sesji nie daje SQL
  - Jak rozpoznać: Ta sama encja ładowana kilka razy w jednej transakcji / requeście z OSIV
  - Wpływ: Statycznie przewidziany SELECT nie pojawia się w logu
- Bytecode enhancement (hibernate-enhance-maven-plugin) robi leniwe także pola proste i @OneToOne po stronie nie-właściciela
  - Jak rozpoznać: Plugin enhance w pom/gradle, @Basic(fetch=LAZY)
  - Wpływ: Dodatkowe SELECTy przy dostępie do zwykłych pól
- Batch fetching zamienia N+1 na ceil(N/batch) zapytań 'where id in (?,?,...)' (H6 może użyć '= any(?)' z tablicą)
  - Jak rozpoznać: @BatchSize lub default_batch_fetch_size; Quarkus ustawia domyślnie quarkus.hibernate-orm.fetch.batch-size=16
  - Wpływ: Wzorzec N+1 nie wygląda jak N identycznych SELECTów
- hibernate.enable_lazy_load_no_trans=true: lazy-load poza sesją otwiera tymczasową sesję i nowe połączenie zamiast rzucać LazyInitializationException
  - Jak rozpoznać: Właściwość w konfiguracji; brak LazyInitializationException mimo OSIV=false
  - Wpływ: SQL poza jakąkolwiek transakcją, osobne połączenie z puli na każdy lazy-load

**Spring JdbcTemplate / NamedParameterJdbcTemplate / JdbcClient / SimpleJdbcCall**

- 'Executing prepared SQL query' bez tekstu SQL
  - Jak rozpoznać: Warianty z PreparedStatementCreator: SQL pojawia się dopiero w następnej linii 'Executing prepared SQL statement [..]' i tylko wtedy, gdy creator implementuje SqlProvider
  - Wpływ: Parser musi łączyć sąsiednie linie; przy własnym PreparedStatementCreator SQL może w ogóle nie trafić do logu
- Parametry w JdbcTemplate.batchUpdate są logowane per wiersz na TRACE (duży wolumen) albo wcale przy własnym BatchPreparedStatementSetter
  - Jak rozpoznać: batchUpdate(sql, BatchPreparedStatementSetter)
  - Wpływ: Jedna linia DEBUG odpowiada N operacjom
- batchUpdate(String... sql) loguje tylko liczbę statementów, bez ich treści
  - Jak rozpoznać: Linia 'Executing SQL batch update of N statements'
  - Wpływ: SQL batcha nie jest widoczny w logu JdbcTemplate; trzeba proxy albo OTel

**MyBatis (i iBATIS 2): mappery XML/adnotacje, dynamiczny SQL, logi per statement**

- Nazwa loggera to namespace, nie klasa Javy. Mapper XML bez interfejsu jest wywoływany przez sqlSession.selectOne("ns.id")
  - Jak rozpoznać: Wywołania SqlSession/SqlSessionTemplate ze stringiem 'ns.id'
  - Wpływ: Graf kodu nie ma krawędzi do mappera; trzeba połączyć string z <mapper namespace> w XML
- Span MyBatis w OTel powstaje tylko dla wywołań przez interfejs mappera (MapperMethod); sqlSession.selectOne("ns.id") nie daje spanu MyBatis
  - Jak rozpoznać: Wywołania SqlSession ze stringiem, a w trace tylko spany JDBC
  - Wpływ: Brak węzła mappera w przebiegu mimo włączonej instrumentacji
- PageHelper i inne pluginy przepisują SQL (dokładają COUNT, LIMIT)
  - Jak rozpoznać: com.github.pagehelper w zależnościach, PageHelper.startPage(...)
  - Wpływ: SQL w logu różni się od SQL w XML; dodatkowe zapytanie *_COUNT
- Cache lokalny (sesji) i <cache/> drugiego poziomu
  - Jak rozpoznać: <cache> w mapperze, localCacheScope=SESSION (domyślnie)
  - Wpływ: Drugie identyczne wywołanie w tej samej transakcji nie generuje SQL
- statementType=STATEMENT lub ${} daje zwykły Statement: w logu '==>  Executing:' z wartościami zamiast pary Preparing/Parameters
  - Jak rozpoznać: statementType="STATEMENT" w XML, ${...} w treści
  - Wpływ: Inny regex; każde wywołanie ma unikalny tekst SQL

**jOOQ i Querydsl SQL: query buildery**

- jOOQ może wykonać SQL bez swojego wykonania JDBC (R2DBC, getSQL() przekazany do JdbcTemplate)
  - Jak rozpoznać: ctx.select(...).getSQL() / getBindValues() przekazane gdzie indziej
  - Wpływ: jOOQ tylko renderuje; wykonanie i logi należą do innego mechanizmu
- Inline bind values w logu jOOQ to rekonstrukcja, a nie to, co wysłano do bazy
  - Jak rozpoznać: Linia '-> with bind values'
  - Wpływ: Do korelacji z logiem bazy trzeba użyć szablonu z '?'
- Settings.withStatementType(STATIC_STATEMENT) albo inline(...) w zapytaniu: jOOQ wysyła SQL z literałami zamiast '?'
  - Jak rozpoznać: StatementType.STATIC_STATEMENT w konfiguracji, DSL.inline(...) w kodzie
  - Wpływ: Brak pary szablon/wartości; każde wywołanie unikalny tekst SQL, sanityzacja OTel zamienia literały na '?'

**Proxy sterownika/DataSource: p6spy, datasource-proxy, log4jdbc, WildFly spy**

- p6spy pokazuje SQL z WSTAWIONYMI wartościami, a nie to, co poszło do bazy
  - Jak rozpoznać: Ostatnia kolumna SingleLineFormat
  - Wpływ: Nie nadaje się do korelacji z pg_stat_statements; do tego służy kolumna prepared
- Pula (Hikari) opakowana zamiast sterownika: proxy nie widzi zapytań walidacyjnych i initSql puli
  - Jak rozpoznać: Proxy na DataSource, a nie na driverze
  - Wpływ: Różnica w liczbie SQL między proxy a logiem bazy
- p6spy bez spy.properties pisze do pliku spy.log, a nie do logu aplikacji
  - Jak rozpoznać: Driver P6SpyDriver, brak appender= w spy.properties, plik spy.log obok procesu
  - Wpływ: Parser logu aplikacji nie widzi żadnego SQL z p6spy; brak MDC
- Kategoria batch jest domyślnie wykluczona w p6spy
  - Jak rozpoznać: excludecategories zawiera batch (wartość domyślna)
  - Wpływ: addBatch nie jest logowane, widać tylko wpis przy executeBatch

**OpenTelemetry: spany JDBC i semconv bazodanowy**

- Sanityzacja: db.statement / db.query.text bez wartości, a SQL sklejany z literałami zamienia się w '?', przez co różne zapytania wyglądają identycznie
  - Jak rozpoznać: '?' w miejscach, gdzie kod ma konkatenację
  - Wpływ: Do odtworzenia parametrów potrzebny jest capture-query-parameters albo proxy
- Brak SQL dla wywołań spoza java.sql (R2DBC bez instrumentacji, natywne sterowniki, sterownik przez JNI)
  - Jak rozpoznać: Zależności r2dbc-*, brak spanów db mimo zapytań w logu bazy
  - Wpływ: Dziura w przebiegu
- Wywołania JDBC poza kontekstem requestu (pula, @Scheduled, wątki Executora bez propagacji kontekstu) dają osobne trace albo zostają bez rodzica
  - Jak rozpoznać: Spany JDBC jako root
  - Wpływ: SQL nie zostanie przypisany do requestu
- Klucz konfiguracji z innej wersji agenta jest po cichu ignorowany
  - Jak rozpoznać: Wersja agenta w Dockerfile/skrypcie; np. query-sanitization.enabled na agencie 2.20 albo capture-query-parameters na agencie przed 2.16
  - Wpływ: Flaga 'nie działa', a w spanach nadal brak parametrów lub sanityzacja
- Przy włączonej instrumentacji Hibernate (domyślnie w 2.x) obok spanów JDBC są spany Session.*/zapytań HQL
  - Jak rozpoznać: Spany INTERNAL 'Session.find ...' i nazwy z HQL nad spanami JDBC
  - Wpływ: Liczenie 'zapytań' po wszystkich spanach daje podwójne wyniki; liczyć tylko spany CLIENT z db.system

**Procedury składowane, funkcje, triggery i widoki: logika po stronie bazy**

- Soft delete przez @SQLDelete: repo.delete() wykonuje UPDATE
  - Jak rozpoznać: @SQLDelete na encji
  - Wpływ: Operacja 'delete' w grafie to w bazie UPDATE
- Encja na widoku: zapis do widoku zablokowany (@Immutable) albo obsłużony triggerem INSTEAD OF
  - Jak rozpoznać: Tabela z @Table zaczyna się od v_ / vw_ albo istnieje w migracjach jako CREATE VIEW
  - Wpływ: Rzeczywiste tabele bazowe nie są wymienione w kodzie
- Funkcja bazodanowa wywołana w zwykłym SELECT / @Formula (select f(x) from dual, nextval, funkcje z efektami ubocznymi)
  - Jak rozpoznać: Nazwy funkcji z migracji (CREATE FUNCTION) w tekstach SQL zapytań
  - Wpływ: Span i log pokazują SELECT, a w bazie wykonuje się logika (także zapisy w PL/pgSQL); detektor szukający CALL ją przeoczy

**Batch: JDBC addBatch, Hibernate jdbc.batch_size, przepisywanie przez sterownik**

- IDENTITY wyłącza batch INSERT po cichu
  - Jak rozpoznać: @GeneratedValue(strategy = IDENTITY) przy ustawionym batch_size
  - Wpływ: Wbrew konfiguracji zostaje N osobnych round-tripów
- Przepisanie przez sterownik: w logu bazy 1 INSERT, w logu aplikacji N
  - Jak rozpoznać: rewriteBatchedStatements / reWriteBatchedInserts w URL
  - Wpływ: Korelacja aplikacja<->baza musi uwzględniać agregację

**Log po stronie bazy i korelacja z requestem**

- MySQL Connector/J bez useServerPrepStmts=true robi prepared po stronie klienta, więc w logu bazy jest SQL z wartościami. Z server prep w general_log są osobne linie Prepare i Execute
  - Jak rozpoznać: Parametry URL useServerPrepStmts / cachePrepStmts
  - Wpływ: Inny format do parsowania
- application_name ustawiony per pula, a nie per request
  - Jak rozpoznać: Jedna wartość %a dla wszystkich linii
  - Wpływ: Sama nazwa nie skoreluje requestu; potrzebny komentarz albo pid zestawiony z logiem aplikacji (Hikari nie loguje pid)
- Unikalny komentarz w każdym SQL: w PostgreSQL pg_stat_statements NIE rozbija się (queryid liczony z drzewa zapytania, komentarze pomijane), ale w Oracle (shared pool, V$SQL, hard parse) i SQL Server (plan cache) każdy tekst jest osobnym kursorem/planem; w pgjdbc każdy tekst to osobny statement, więc próg prepareThreshold nigdy nie zostaje osiągnięty
  - Jak rozpoznać: Gwałtowny wzrost liczby kursorów w V$SQL / planów w sys.dm_exec_cached_plans; w PG tylko linie 'execute <unnamed>'
  - Wpływ: Koszt wydajnościowy zależny od bazy (ostrzega też README sqlcommenter agenta). Na produkcji ostrożnie
- Przed prepareThreshold pgjdbc wysyła statement nienazwany
  - Jak rozpoznać: Linie 'execute <unnamed>:' zamiast 'execute S_n:'
  - Wpływ: Parser nie może zakładać nazwanych statementów; nazwa S_n nie identyfikuje zapytania między połączeniami

**Logowanie na poziomie sterownika JDBC**

- Logi sterownika nie mają MDC requestu, jeśli JUL idzie przez osobny handler (ConsoleHandler)
  - Jak rozpoznać: Linie logu w innym formacie, na stderr
  - Wpływ: Potrzebny mostek do SLF4J albo korelacja po czasie i nazwie wątku
- Oracle: pełny trace tylko z jarem *_g
  - Jak rozpoznać: W classpath ojdbc8.jar bez _g
  - Wpływ: oracle.jdbc.Trace=true nic nie da
- pgjdbc starszy niż 42.0.0 (seria 9.x) ma własny mechanizm logowania (parametr URL loglevel, DriverManager log writer), JUL nie działa
  - Jak rozpoznać: org.postgresql:postgresql 9.x albo postgresql-9.x-xxxx.jdbc4.jar w legacy
  - Wpływ: Konfiguracja logger 'org.postgresql' nic nie da; inny format linii

**Java EE / Jakarta EE: JPA w kontenerze (EclipseLink, OpenJPA, Hibernate w WildFly), EJB/JTA, JNDI DataSource**

- EclipseLink nie robi lazy-load relacji @OneToOne/@ManyToOne bez weavingu (eclipselink.weaving), więc ładuje je EAGER
  - Jak rozpoznać: Aplikacja SE/Tomcat bez agenta EclipseLink ani statycznego weavingu (w serwerach Java EE weaving jest zwykle dynamiczny)
  - Wpływ: Przy tych samych adnotacjach inne SQL niż w Hibernate
- Flush przy JTA beforeCompletion, poza stosem metody biznesowej
  - Jak rozpoznać: SQL UPDATE w logu po wpisie o zakończeniu metody EJB
  - Wpływ: Przypisanie do metody tylko po granicach transakcji
- BMT (UserTransaction) albo NOT_SUPPORTED: granice transakcji w kodzie albo brak transakcji, a nie z adnotacji
  - Jak rozpoznać: @TransactionManagement(TransactionManagementType.BEAN), ut.begin()/ut.commit(), @TransactionAttribute(NOT_SUPPORTED)
  - Wpływ: Flush przy ut.commit() w środku metody; przy NOT_SUPPORTED EntityManager działa bez transakcji (zmiany encji nie trafiają do bazy)

**Spring 2.5–4 z XML i stare szablony DAO (HibernateTemplate, JdbcDaoSupport, transakcje AOP w XML)**

- Bean DAO zdefiniowany tylko w XML, klasa bez adnotacji i bez sufiksu
  - Jak rozpoznać: Klasa użyta w <bean class=...> i ma pole SessionFactory/DataSource
  - Wpływ: Graf kodu musi obejmować XML, inaczej DAO nie zostanie rozpoznane
- Granice transakcji z pointcutu w XML, a nie z @Transactional
  - Jak rozpoznać: <tx:advice> + <aop:advisor>
  - Wpływ: Metody transakcyjne trzeba wyznaczyć dopasowując wyrażenia AspectJ do metod
- Hibernate 3.6 loguje wartość parametru bez nawiasów kwadratowych
  - Jak rozpoznać: hibernate-core 3.6.x, linie 'binding parameter [n] as [T] - wartosc'
  - Wpływ: Regex z H4/H5 ('- \[(.*)\]') gubi wszystkie parametry

**Reaktywny dostęp do danych (R2DBC, Hibernate Reactive, Vert.x SQL) i Micronaut Data**

- Brak MDC w logach SQL wykonywanych na wątkach reactor-tcp-nio / vert.x-eventloop
  - Jak rozpoznać: Pusty traceId w liniach 'Executing SQL statement'
  - Wpływ: Korelacja SQL z requestem tylko przez context-propagation albo czas
- Micronaut: brak refleksji i proxy w runtime, więc aspekty AOP Springa nie działają
  - Jak rozpoznać: io.micronaut w zależnościach
  - Wpływ: Wstrzykiwanie przez @Around (Micronaut AOP) albo odczyt SQL z wygenerowanych klas

**Aplikacje bez bazy relacyjnej lub z bazą 'obok' (NoSQL, cache, pliki, zdalne API)**

- H2 lub HSQLDB na classpath (np. przez starter albo błędny scope) tworzy DataSource mimo braku realnego użycia
  - Jak rozpoznać: Linie 'HikariPool-1 - Start completed' bez żadnego SQL w przebiegach; jdbc:h2:mem w logu
  - Wpływ: Nie oznaczać aplikacji jako 'z bazą' na podstawie samej obecności DataSource
- Ta sama encja/interfejs w dwóch modułach Spring Data (JPA i Mongo) przy strict mode
  - Jak rozpoznać: Log INFO z RepositoryConfigurationExtensionSupport: 'Spring Data JPA - Could not safely identify store assignment for repository candidate interface ...; If you want this repository to be a JPA repository, ...'
  - Wpływ: Repozytorium może trafić do innego modułu, niż sugeruje kod, albo zostać pominięte

**Przypisanie SQL do metody i requestu: granice transakcji i MDC jako szkielet**

- Metoda @Transactional wywołana z tej samej klasy (self-invocation) nie przechodzi przez proxy
  - Jak rozpoznać: Brak 'Creating new transaction with name [X]' dla metody X; this.metoda() w kodzie
  - Wpływ: SQL przypisany do metody wywołującej, a REQUIRES_NEW nie działa
- Tryb AspectJ (@EnableTransactionManagement(mode=ASPECTJ), spring-aspects + weaving) obsługuje także self-invocation i metody nie-public
  - Jak rozpoznać: mode=ASPECTJ, aspectj-maven-plugin albo -javaagent:aspectjweaver
  - Wpływ: Reguła 'self-invocation omija transakcję' nie obowiązuje; REQUIRES_NEW na this.metoda() działa
- @Async / CompletableFuture / własne pule gubią MDC
  - Jak rozpoznać: SQL z pustym traceId na wątku task-N
  - Wpływ: Potrzebny TaskDecorator kopiujący MDC
- Axon / Spring Batch / Quartz piszą do własnych tabel (token_entry, BATCH_JOB_EXECUTION, QRTZ_*)
  - Jak rozpoznać: SQL na tabelach frameworka
  - Wpływ: Szum, który trzeba odfiltrować albo oznaczyć jako infrastrukturę
- SQL w afterCommit / @TransactionalEventListener(phase=AFTER_COMMIT) wykonuje się po commit, bez nowej transakcji (chyba że REQUIRES_NEW)
  - Jak rozpoznać: @TransactionalEventListener, TransactionSynchronization.afterCommit w kodzie; SQL po 'Committing ...' bez nowego 'Creating new transaction'
  - Wpływ: Zapis może się nie utrwalić (JPA bez flush) albo pójść w auto-commit; przypisanie do metody publikującej zdarzenie, nie do listenera, jest błędne

**SQL infrastruktury frameworków (Spring Batch, Quartz, Spring Session JDBC, Spring Integration JDBC, ShedLock, Flyway/Liquibase)**

- Spring Session JDBC zapisuje sesję po obsłudze requestu (SessionRepositoryFilter po zwrocie z kontrolera), osobnym połączeniem
  - Jak rozpoznać: spring-session-jdbc w zależnościach; UPDATE/INSERT SPRING_SESSION(_ATTRIBUTES) na końcu każdego requestu
  - Wpływ: SQL po zakończeniu warstwy web, nie należy do żadnej metody domenowej; łatwo uznać za 'tajemniczy zapis'
- Spring Integration JdbcPollingChannelAdapter / Quartz / ShedLock wykonują SQL cyklicznie, bez żadnego requestu
  - Jak rozpoznać: Zapytania co stały interwał na tabelach INT_*, QRTZ_*, shedlock albo z zapytania w <int-jdbc:inbound-channel-adapter query>
  - Wpływ: Szum w przebiegach i spany JDBC jako root; zapytanie z adaptera XML to wejście procesu (jak listener), a nie wywołanie z kodu

**EJB 2.x CMP/BMP i J2EE sprzed JPA**

- ejbStore wołany na końcu każdej transakcji dla każdej załadowanej encji (zależnie od dostawcy i ustawień typu read-only/dirty check)
  - Jak rozpoznać: Serie UPDATE bez zmian danych przy commit
  - Wpływ: Dużo UPDATE niewynikających z logiki; liczba SQL zależy od konfiguracji kontenera
- Finder CMP ładuje najpierw same klucze, a potem encje pojedynczo (N+1 kontenera), zależnie od strategii read-ahead
  - Jak rozpoznać: findByX w Home, read-ahead / eager-load-group w jbosscmp-jdbc.xml
  - Wpływ: Jeden finder to 1+N SELECT

**Inne mappery i ORM spotykane w legacy: Jdbi, Ebean, Commons DbUtils, Cayenne, natywne API Hibernate**

- Jdbi bez skonfigurowanego SqlLoggera nie loguje nic, nawet przy DEBUG na org.jdbi
  - Jak rozpoznać: Brak setSqlLogger w konfiguracji Jdbi
  - Wpływ: Fałszywy wniosek 'brak SQL'; trzeba proxy JDBC
- Session.doWork / em.unwrap(Connection) to surowy JDBC wewnątrz ORM, poza org.hibernate.SQL
  - Jak rozpoznać: doWork, doReturningWork, unwrap(Connection.class) w kodzie
  - Wpływ: SQL niewidoczny w logach Hibernate, widoczny tylko w proxy/OTel

## Transakcje

### Mechanizmy

| Nazwa | Jak rozpoznać statycznie | W logu | W OTel | Wstrzyknięcie |
|---|---|---|---|---|
| Spring AbstractPlatformTransactionManager: granice tx w logach DEBUG (begin/join/suspend/nested/commit/rollback) | Bean typu PlatformTransactionManager (Boot: HibernateJpaConfiguration/JpaBaseConfiguration → JpaTransactionManager, DataSourceTransactionManagerAutoConfiguration → JdbcTransactionManager od Boot 2.5/Spring 5.3, wcześniej DataSourceTransactionManager). XML: <bean class="org.springframework.orm.jpa.JpaTransactionManager">, <tx:annotation-driven transaction-manager=".."/>. Wiele menedżerów → @Transactional("qualifier") / transactionManager=, @Primary na jednym z nich. | PUŁAPKA: logger = getClass() konkretnej podklasy, nie pakiet org.springframework.transaction. Włączyć: logging.level.org.springframework.orm.jpa.JpaTransactionManager=DEBUG (albo org.springframework.orm.jpa=DEBUG), logging.level.org.springframework.jdbc.datasource.DataSourceTransactionManager=DEBUG / org.springframework.jdbc.support.JdbcTransactionManager=DEBUG (JdbcTransactionManager jest w pakiecie org.springframework.jdbc.support!), logging.level.org.springframework.transaction=DEBUG (JtaTransactionManager, TransactionTemplate). Regexy: 'Creating new transaction with name \[(?<name>[^\]]+)\]: (?<prop>PROPAGATION_[A-Z_]+),(?<iso>ISOLATION_[A-Z_]+)(?<rest>[^;]*)(; .*)?$' ; 'Participating in existing transaction' ; 'Suspending current transaction, creating new transaction with name \[(?<name>[^\]]+)\]' ; 'Suspending current transaction$' ; 'Creating nested transaction with name \[(?<name>[^\]]+)\]' ; 'Initiating transaction (commit\|rollback)'. Korelacja po nazwie wątku (%thread) — commit/rollback nie mają nazwy tx; stos zagnieżdżeń per wątek (push na Creating/Suspending/Nested, pop na commit/rollback/Releasing savepoint/Rolling back to savepoint). | Brak spanów dla granic tx z menedżera Springa. Pośrednio: opt-in spany JDBC dla COMMIT/ROLLBACK (otel.instrumentation.jdbc.experimental.transaction.enabled=true, domyślnie false, wprowadzone ok. 2.16.0) oraz span Hibernate 'Transaction.commit' (tylko commit). Bez kodu: otel.instrumentation.methods.include=org.springframework.transaction.support.AbstractPlatformTransactionManager[getTransaction,commit,rollback] (metody są final i zadeklarowane w APTM, więc instrumentacja klasy deklarującej wystarcza). | Bez zmian w kodzie: poziomy logów jw. + %thread w logging.pattern. Ze zmianą (Spring 6.1+/Boot 3.2+): bean implementujący org.springframework.transaction.TransactionExecutionListener (beforeBegin/afterBegin/beforeCommit/afterCommit/beforeRollback/afterRollback) — Boot 3.2+ sam go podpina (TransactionManagerCustomizationAutoConfiguration, @since 3.2.0, bean ExecutionListenersTransactionManagerCustomizer zbiera wszystkie TransactionExecutionListener). Bez Boota: ConfigurableTransactionManager.addListener / setTransactionExecutionListeners. TransactionExecution daje getTransactionName(), isNewTransaction(), isNested(), isReadOnly(), isRollbackOnly(). Starsze wersje: BeanPostProcessor owijający PlatformTransactionManager (dekorator getTransaction/commit/rollback) albo TransactionSynchronization rejestrowana w TransactionSynchronizationManager. |
| Spring @Transactional przez proxy (TransactionInterceptor) — deklaratywne granice i TRACE per metoda | Adnotacje: @org.springframework.transaction.annotation.Transactional, @jakarta.transaction.Transactional / @javax.transaction.Transactional (TxType, rollbackOn, dontRollbackOn), @jakarta.ejb.TransactionAttribute / @javax.ejb.TransactionAttribute; meta-adnotacje (własne @UseCase z @Transactional, @ApplicationModuleListener). Na klasie = wszystkie metody publiczne (od 6.0 przy CGLIB także protected/package). Atrybuty: propagation, isolation, readOnly, timeout/timeoutString, rollbackFor/noRollbackFor(+ClassName), transactionManager/value, label. Włączenie: @EnableTransactionManagement (Boot: TransactionAutoConfiguration robi to sam), mode=AdviceMode.PROXY\|ASPECTJ, proxyTargetClass, order. Spring Data: SimpleJpaRepository/SimpleJdbcRepository mają @Transactional(readOnly = true) na klasie i @Transactional na save*/delete*. | DWA różne loggery: logging.level.org.springframework.transaction.interceptor=TRACE (TransactionInterceptor: Getting/Completing) ORAZ logging.level.org.springframework.transaction.annotation=TRACE (AnnotationTransactionAttributeSource: 'Adding transactional method' — logger = getClass(), więc pakiet annotation, nie interceptor). Regexy: 'Getting transaction for \[(?<m>[^\]]+)\]', 'Completing transaction for \[(?<m>[^\]]+)\]( after exception: (?<ex>.*))?', "Adding transactional method '(?<m>[^']+)' with attribute: (?<attr>.*)". Parowanie Getting/Completing per wątek daje drzewo metod transakcyjnych; połączenie z DEBUG menedżera mówi, która otworzyła fizyczną tx. | Brak spanu dla @Transactional. Metody serwisów nie mają spanów, chyba że @WithSpan albo otel.instrumentation.methods.include. Repozytoria Spring Data mają spany INTERNAL '<RepoInterface>.<metoda>' (instrumentacja spring-data-1.8). | Bez zmian: TRACE jw. Ze zmianą: własny @Aspect z @Around("@annotation(org.springframework.transaction.annotation.Transactional) \|\| @within(org.springframework.transaction.annotation.Transactional)") z @Order wyższym priorytetem niż advisor tx (logujący TransactionSynchronizationManager.isActualTransactionActive(), getCurrentTransactionName(), isCurrentTransactionReadOnly() — uwaga: przed wejściem do tx pokaże stan zewnętrzny, z niższym priorytetem — wewnętrzny); albo podmiana beana transactionInterceptor (ProxyTransactionManagementConfiguration) na podklasę. Agent: OTel methods include na TransactionInterceptor[invoke] — span bez nazwy metody biznesowej, lepiej TRACE. |
| Self-invocation, metody private/final/static — @Transactional pomijany przez proxy (Spring, EJB); inaczej w Quarkus i Micronaut | Spring: wywołanie metody z @Transactional (lub w klasie z @Transactional) bez kwalifikatora albo przez this. wewnątrz tej samej klasy; @Transactional na metodzie private/final/static; klasa final (Kotlin — bez pluginu kotlin-spring/allopen proxy CGLIB się nie utworzy). Rozróżnić: @EnableTransactionManagement(mode = AdviceMode.ASPECTJ), <tx:annotation-driven mode="aspectj"/>, @EnableLoadTimeWeaving, META-INF/aop.xml, spring-aspects, aspectj-maven-plugin / io.freefair.aspectj. Wzorce omijające: @Autowired @Lazy self; AopContext.currentProxy() (exposeProxy=true); ApplicationContext.getBean(self). Stos technologii: io.quarkus:* / io.micronaut:* → self-invocation nie jest sygnałem martwej granicy. | Spring, TRACE TransactionInterceptor: brak linii 'Getting transaction for [Klasa.wewnetrznaMetoda]'; DEBUG menedżera: brak 'Suspending current transaction, creating new transaction' dla metody REQUIRES_NEW. Spring dla metody private z adnotacją nic nie loguje. Quarkus: build kończy się błędem dla private metody z @Transactional (chyba że flaga wyłączona — wtedy cicho martwa). | brak | Statycznie: reguła w grafie kodu — krawędź wywołania wewnątrz tej samej klasy do metody z atrybutem tx = 'granica nieaktywna (proxy)', tylko dla Spring proxy/EJB i gdy nie wykryto AspectJ. W runtime: OTel methods include / ByteBuddy na samej metodzie logujący TransactionSynchronizationManager.getCurrentTransactionName() — nazwa będzie metodą zewnętrzną, co dowodzi self-invocation. |
| Reguły rollbacku: checked exceptions, łapanie wyjątków, setRollbackOnly, timeout | Sygnatury 'throws' z checked wyjątkami w metodach @Transactional bez rollbackFor; Kotlin (brak checked — IOException/SQLException rzucone z Kotlina też nie rollują); rollbackFor = Exception.class / noRollbackFor; rollbackForClassName = "..." (dopasowanie podciągiem!); XML <tx:method name="*" rollback-for="Exception"/>; transactionAttributes '-Exception'; @ApplicationException; setRollbackOnly( w kodzie; catch (Exception e) { log... } w metodzie transakcyjnej; @Transactional(timeout=..). | TransactionInterceptor TRACE: 'Completing transaction for [..] after exception: java.io.IOException' po którym w DEBUG menedżera 'Initiating transaction commit' = checked exception skomitowana. 'Transactional code has requested rollback' = setRollbackOnly bez wyjątku. 'Global transaction is marked as rollback-only but transactional code requested commit' = rollback-only z wewnętrznego uczestnika. ERROR 'Application exception overridden by commit exception' (TransactionInterceptor). UnexpectedRollbackException / TransactionTimedOutException 'Transaction timed out: deadline was <data>' w logu błędów. | Span serwera HTTP może mieć status OK/200 przy faktycznym rollbacku (setRollbackOnly) i error przy commit (checked). Bezpośredni sygnał: opt-in span JDBC ROLLBACK (otel.instrumentation.jdbc.experimental.transaction.enabled). | TransactionExecutionListener.afterCommit/afterRollback + podklasa TransactionInterceptor z nadpisanym completeTransactionAfterThrowing (log: wyjątek, txAttr.rollbackOn(ex)). Bez zmian w kodzie: TRACE interceptora + DEBUG menedżera i reguła korelacji 'after exception' → commit/rollback. |
| Transakcje programowe: TransactionTemplate, PlatformTransactionManager, TransactionalOperator, UserTransaction, QuarkusTransaction, jOOQ, czysty JDBC | Regexy: '\bTransactionTemplate\b', '\.execute(WithoutResult)?\(', 'getTransaction\(', 'TransactionStatus', 'TransactionalOperator', 'UserTransaction', '@TransactionManagement\(.*BEAN', 'QuarkusTransaction\.', '\.transaction(Result)?\(' na DSLContext, 'setAutoCommit\(false\)', '\.setSavepoint\('. TransactionTemplate z setPropagationBehavior(PROPAGATION_REQUIRES_NEW) itp. | DEBUG menedżera: 'Creating new transaction with name [null]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT' (template bez nazwy) — sygnał granicy programowej; z TransactionTemplate.setName("x") → [x]. Reactive: logger org.springframework.r2dbc.connection.R2dbcTransactionManager (komunikaty AbstractReactiveTransactionManager: 'Creating new transaction with name', 'Initiating transaction commit'). Czysty JDBC: brak logów frameworka → p6spy (kategorie commit/rollback w linii '...\|commit\|connection N\|...') albo datasource-proxy. | Brak spanu tx; JDBC COMMIT/ROLLBACK opt-in (łapie też czysty JDBC commit/rollback, bo hookuje Connection.commit/rollback). | Bez zmian: DEBUG menedżera; dla czystego JDBC — owinięcie DataSource (p6spy: spy.properties, driver com.p6spy.engine.spy.P6SpyDriver lub P6DataSource; datasource-proxy z MethodExecutionListener na commit/rollback/setAutoCommit). Ze zmianą: TransactionTemplate.setName(<use case>). |
| Transakcje niejawne: autocommit, transakcje na poziomie repozytorium Spring Data, JdbcTemplate/MyBatis bez tx, efekty po stronie bazy | Brak @Transactional w ścieżce od wejścia do wywołań DAO; spring.datasource.hikari.auto-commit; hibernate.connection.provider_disables_autocommit; @Modifying bez @Transactional w repozytorium; jdbcTemplate.update( w klasie bez adnotacji; SqlSessionTemplate bez menedżera tx; DDL (CREATE/ALTER/TRUNCATE) w kodzie aplikacji; CALL/{call ..} procedur; PRAGMA AUTONOMOUS_TRANSACTION i COMMIT w PL/SQL / procedurach PostgreSQL 11+. | logging.level.org.springframework.jdbc.datasource.DataSourceUtils=DEBUG: 'Fetching JDBC Connection from DataSource' przy każdym zapytaniu (logowane tylko, gdy do wątku nie jest przypięty ConnectionHolder; w tx DataSourceTransactionManager go nie ma) = autocommit. MyBatis (logging.level.org.mybatis.spring=DEBUG): 'Creating a new SqlSession', 'SqlSession [..] was not registered for synchronization because synchronization is not active', 'JDBC Connection [..] will not be managed by Spring', 'Closing non transactional SqlSession [..]'; w tx: 'Registering transaction synchronization for SqlSession [..]', 'JDBC Connection [..] will be managed by Spring', 'Transaction synchronization committing SqlSession [..]'. Hibernate 5.x/6.x/7.0–7.1: logger org.hibernate.resource.jdbc.internal.AbstractLogicalConnectionImplementor TRACE 'Preparing to begin transaction via JDBC Connection.setAutoCommit(false)', 'Transaction begun via JDBC Connection.setAutoCommit(false)', 'Transaction committed via JDBC Connection.commit()', 'Transaction rolled-back via JDBC Connection.rollback()', 're-enabling auto-commit on JDBC Connection after completion of JDBC-based transaction'; Hibernate 7.2+: kategoria org.hibernate.orm.resource.jdbc TRACE, rollback jako 'Transaction rolled back via JDBC Connection.rollback()'. | Spany JDBC bez otaczającego COMMIT (przy włączonym experimental.transaction) = autocommit; brak spanu Transaction.commit z Hibernate. | Bez zmian: logi jw. Po stronie bazy: MySQL general_log ('SET autocommit=0'/'commit'); PostgreSQL log_statement=all + log_line_prefix z %x (xid) / %v (virtual xid) — grupuje instrukcje po transakcji. Ze zmianą: proxy DataSource (p6spy/datasource-proxy) logujące getAutoCommit() przy każdym statement. |
| Kod JDBC poza transakcją Springa mimo @Transactional: surowy DataSource, TransactionAwareDataSourceProxy, LazyConnectionDataSourceProxy | dataSource.getConnection() / DriverManager.getConnection w DAO; new TransactionAwareDataSourceProxy(..), LazyConnectionDataSourceProxy w configu/XML; JpaTransactionManager bez setDataSource w configu nie-Bootowym; dwa beany DataSource; JdbcTemplate i JPA w jednej metodzie. | JpaTransactionManager DEBUG 'Exposing JPA transaction as JDBC [..]' (jest ekspozycja) vs 'Not exposing JPA transaction [..] as JDBC transaction because JpaDialect [..] does not support JDBC Connection retrieval'; DataSourceUtils DEBUG 'Fetching JDBC Connection from DataSource' wewnątrz trwającej tx = połączenie spoza tx; Hikari DEBUG 'Pool stats (... active=2 ...)' przy jednym requeście = dwa połączenia. | Spany JDBC z jednego requestu na różnych połączeniach są nierozróżnialne (brak id połączenia); przy opt-in COMMIT — statementy z surowego DataSource nie mają po sobie COMMIT. | Bez zmian: DEBUG DataSourceUtils + JpaTransactionManager. Ze zmianą: datasource-proxy logujący przy getConnection() TransactionSynchronizationManager.isActualTransactionActive() i hasResource(dataSource). |
| Hibernate/JPA: flush, dirty checking i przesunięcie SQL na granicę commit | @Entity zmieniana setterem w metodzie @Transactional bez save(); saveAndFlush/flush(); @Modifying(flushAutomatically/clearAutomatically); hibernate.flushMode / spring.jpa.properties.org.hibernate.flushMode; @GeneratedValue(strategy=IDENTITY) vs SEQUENCE; FlushModeType.COMMIT; hibernate.jdbc.batch_size, hibernate.order_inserts/order_updates (zmiana kolejności SQL przy flush). | logging.level.org.hibernate.SQL=DEBUG (bez zmian w 7.x) — zapytania; flush: logging.level.org.hibernate.event.internal.AbstractFlushingEventListener=DEBUG (≤7.1) lub org.hibernate.orm.event=DEBUG (7.2+), regex 'Flushed: (?<i>\d+) insertions, (?<u>\d+) updates, (?<d>\d+) deletions to (?<o>\d+) objects'; tx Hibernate: org.hibernate.engine.transaction.internal.TransactionImpl=DEBUG (≤7.1) / org.hibernate.orm.core=DEBUG (7.2+); hibernate.generate_statistics=true lub hibernate.session.events.log=true → StatisticalLoggingSessionEventListener INFO 'Session Metrics {... N JDBC statements ... N flushes ...}'. Kolejność w logu Springa: SQL po 'Initiating transaction commit' a przed 'Committing JPA transaction on EntityManager'? — UWAGA: flush przy commit odbywa się w EntityTransaction.commit(), czyli PO linii 'Committing JPA transaction on EntityManager [..]'. | Hibernate instrumentation: span INTERNAL 'Transaction.commit' jako rodzic spanów JDBC INSERT/UPDATE z flusha; spany 'Session.persist <Encja>', 'Session.merge <Encja>' itp. zwykle bez SQL pod spodem. Atrybut eksperymentalny hibernate.session_id: otel.instrumentation.hibernate.experimental-span-attributes=true. | Bez zmian: logi jw. Ze zmianą: StatementInspector (hibernate.session_factory.statement_inspector) dopisujący komentarz z nazwą tx (TransactionSynchronizationManager.getCurrentTransactionName()) do SQL; Integrator rejestrujący FlushEventListener / PreUpdateEventListener; hibernate.use_sql_comments=true. |
| readOnly: co faktycznie robi i gdzie jest ignorowane | @Transactional(readOnly = true), <tx:method name="get*" read-only="true"/>, 'PROPAGATION_REQUIRED,readOnly' w transactionAttributes; klasa-poziom readOnly w SimpleJpaRepository i na interfejsach repozytoriów; AbstractRoutingDataSource / LazyConnectionDataSourceProxy (routing master/replica); setValidateExistingTransaction(true); setEnforceReadOnly(true). | Menedżer DEBUG: definicja zawiera ',readOnly' ('Creating new transaction with name [..]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT,readOnly'). DataSourceUtils DEBUG: 'Setting JDBC Connection [..] read-only', 'Resetting read-only flag of JDBC Connection [..]', 'Could not set JDBC Connection read-only'. | Brak atrybutu readOnly; pośrednio server.address/db.namespace repliki w spanie JDBC. | TransactionExecutionListener.afterBegin → transaction.isReadOnly(); albo aspekt logujący TransactionSynchronizationManager.isCurrentTransactionReadOnly() przy każdym wywołaniu repozytorium zapisującego (wykrywa 'zapis w readOnly'). |
| NESTED / savepoint i REQUIRES_NEW — wsparcie zależne od menedżera | propagation = Propagation.NESTED / REQUIRES_NEW / NOT_SUPPORTED / NEVER / MANDATORY / SUPPORTS; @TransactionAttribute(REQUIRES_NEW\|NOT_SUPPORTED\|MANDATORY\|NEVER\|SUPPORTS); TxType.REQUIRES_NEW; setNestedTransactionAllowed(true); ejb-jar.xml <trans-attribute>RequiresNew</trans-attribute>; spring.datasource.hikari.maximum-pool-size. | 'Suspending current transaction, creating new transaction with name [..]' + 'Resuming suspended transaction after completion of inner transaction'; 'Creating nested transaction with name [..]', 'Releasing transaction savepoint', 'Rolling back transaction to savepoint'. Hikari DEBUG com.zaxxer.hikari.pool.HikariPool: 'HikariPool-1 - Pool stats (total=10, active=10, idle=0, waiting=N)'. | Przy REQUIRES_NEW dwa różne połączenia — w spanach JDBC brak id połączenia; opt-in COMMIT wewnętrzny przed zewnętrznym. Metryki puli db.client.connection.* / db.client.connections.* (instrumentacja hikaricp, nazwy zależne od wersji semconv) pokazują pending. | TransactionExecutionListener (isNested()); datasource-proxy na Connection.setSavepoint/rollback(Savepoint); Hikari leakDetectionThreshold. |
| Lazy loading poza transakcją, Open Session/EntityManager In View | spring.jpa.open-in-view (brak klucza = true w Boot); OpenEntityManagerInViewFilter/Interceptor, OpenSessionInViewFilter/Interceptor w web.xml/XML; hibernate.enable_lazy_load_no_trans; FetchType.LAZY + zwracanie encji z kontrolera (@RestController zwraca @Entity); @Transactional na kontrolerze. | Start Boot: WARN logger org.springframework.boot.autoconfigure.orm.jpa.JpaBaseConfiguration$JpaWebConfiguration 'spring.jpa.open-in-view is enabled by default. Therefore, database queries may be performed during view rendering. Explicitly configure spring.jpa.open-in-view to disable this warning'. DEBUG org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor: 'Opening JPA EntityManager in OpenEntityManagerInViewInterceptor' / 'Closing JPA EntityManager in OpenEntityManagerInViewInterceptor'; JpaTransactionManager: 'Found thread-bound EntityManager [..] for JPA transaction' i 'Not closing pre-bound JPA EntityManager after transaction'. org.hibernate.SQL SELECTy po 'Committing JPA transaction'. | Spany JDBC SELECT po zakończeniu spanu Transaction.commit, nadal pod spanem HTTP serwera (serializacja nie ma osobnego spanu). | StatementInspector/datasource-proxy logujący TransactionSynchronizationManager.isActualTransactionActive() przy każdym SQL — SQL z false = poza tx (lazy/OSIV/autocommit). |
| Wątki i async gubią transakcję (@Async, executory, reactive, coroutines, Spring Integration channels, EJB @Asynchronous) | @Async (+@EnableAsync), @Asynchronous (EJB), TaskExecutor/ExecutorService/CompletableFuture.*Async, .parallelStream(), Flux/Mono + Repository JPA, publishOn/subscribeOn, GlobalScope.launch/withContext(Dispatchers.IO) w metodzie @Transactional, Spring Integration: QueueChannel, ExecutorChannel, <int:poller><int:transactional/></int:poller>, IntegrationFlow ...channel(c -> c.executor(..)). | Różne wątki (task-1, SimpleAsyncTaskExecutor-1, boundedElastic-1) w %thread; w nowym wątku osobne 'Creating new transaction with name [..]' albo brak (autocommit 'Fetching JDBC Connection from DataSource'). Wyjątki z metod @Async zwracających void: org.springframework.aop.interceptor.SimpleAsyncUncaughtExceptionHandler ERROR 'Unexpected exception occurred invoking async method: ..' (nie wraca do wołającego i nie rolluje jego tx); dla metod zwracających Future/CompletableFuture wyjątek siedzi w Future i bywa nigdzie nie zalogowany. | Spany kontynuują trace w nowym wątku (instrumentacja executorów propaguje Context), więc trace WYGLĄDA jak jeden przebieg — nie świadczy o wspólnej tx. Rozróżnienie po atrybutach thread.name / thread.id, które Java agent dokłada do spanów domyślnie (ThreadDetailsSpanProcessor; dokładny klucz wyłączający — niezweryfikowany, zależny od wersji agenta). W Spring Boot starterze / Micrometer Tracing tych atrybutów domyślnie brak. | TaskDecorator (ThreadPoolTaskExecutor.setTaskDecorator; Boot 3.x podpina bean TaskDecorator do auto-konfigurowanego executora) logujący przy submit isActualTransactionActive() i nazwę tx wątku wołającego oraz w wątku wykonawczym. Bez zmian: %thread + DEBUG menedżera. |
| @TransactionalEventListener / TransactionSynchronization — kod po commit, po rollback, przed commit | @TransactionalEventListener(phase=..., fallbackExecution=...), @ApplicationModuleListener, TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){ afterCommit() }), afterCompletion(int status), applicationEventPublisher.publishEvent( w metodzie @Transactional, @Observes(during = TransactionPhase.AFTER_SUCCESS), jakarta/javax.transaction.Synchronization, AbstractAggregateRoot/@DomainEvents (Spring Data publikuje przy save()). | logging.level.org.springframework.transaction.event=DEBUG (logger TransactionalApplicationListenerMethodAdapter): 'Registered transaction synchronization for <event>', 'No transaction is active - skipping <event>', WARN 'Processing <event> as a fallback execution on AFTER_ROLLBACK phase'. ERROR org.springframework.transaction.support.TransactionSynchronizationUtils 'TransactionSynchronization.afterCompletion threw exception' / 'TransactionSynchronization.beforeCompletion threw exception'. Micronaut: logger io.micronaut.transaction (komunikat o pominięciu zdarzenia — niezweryfikowany). | Brak osobnego spanu; praca listenera wpada pod span HTTP po spanie Transaction.commit (jeśli istnieje). | Własna TransactionSynchronization rejestrowana z TransactionExecutionListener.afterBegin (lub z aspektu) — loguje beforeCommit/afterCommit/afterCompletion(status) z nazwą tx; daje momenty 'post-commit' w przebiegu. |
| Java EE / Jakarta EE: CMT (EJB), BMT, Jakarta @Transactional, MDB — granice i logi Narayana | @Stateless/@Stateful/@Singleton/@MessageDriven bez @TransactionManagement(BEAN) = CMT REQUIRED; EJB 2.x: klasy implementujące javax.ejb.SessionBean/EntityBean/MessageDrivenBean i ejb-jar.xml <session><transaction-type>Container</transaction-type>; @TransactionAttribute(TransactionAttributeType.X); ejb-jar.xml <assembly-descriptor><container-transaction><method><ejb-name>..</ejb-name><method-name>*</method-name></method><trans-attribute>Required</trans-attribute>; descriptory vendorowe (jboss-ejb3.xml, weblogic-ejb-jar.xml) z timeoutem tx; @ApplicationException(rollback=..); @Resource UserTransaction / SessionContext.setRollbackOnly(); persistence.xml transaction-type="JTA" + <jta-data-source>; @PersistenceContext vs PersistenceContextType.EXTENDED. | Narayana: logger com.arjuna.ats.jta (jtaLogger) TRACE: 'BaseTransaction.begin', 'BaseTransaction.commit', 'BaseTransaction.rollback', 'BaseTransaction.setRollbackOnly', 'TransactionImple.enlistResource ( <XAResource> )', 'TransactionImple.registerSynchronization - Class: ..', 'TransactionImple.commitAndDisassociate', 'TransactionImple.rollbackAndDisassociate'; com.arjuna.ats.arjuna TRACE (BasicAction). WARN ARJUNA012117 'TransactionReaper::check timeout for TX .. in state RUN', ARJUNA012121 '... successfully canceled TX ..' (timeout). WildFly: /subsystem=logging/logger=com.arjuna:add(level=TRACE); ejb3: org.jboss.as.ejb3.invocation ERROR WFLYEJB0034 '(Jakarta Enterprise Beans\|EJB) Invocation failed on component ..'. Quarkus: quarkus.log.category."com.arjuna".level=TRACE + quarkus.log.min-level=TRACE (build-time). Komunikaty Narayana podane z kodu źródłowego — do potwierdzenia w aplikacji testowej. | Agent OTel nie tworzy spanów tx EJB; są spany jaxrs/jaxws, jms ('<queue> process' / nowsze semconv 'process <queue>') i opt-in JDBC COMMIT/ROLLBACK (przy XA commit przez XAResource nie przechodzi przez Connection.commit → brak spanu). Metryki tx serwera przez JMX (nazwy zależne od targetu jmx-metrics — do sprawdzenia). | Bez zmian: TRACE com.arjuna.ats.jta, korelacja po wątku (brak id tx w MDC). Ze zmianą: globalny EJB interceptor (ejb-jar.xml <interceptor-binding><ejb-name>*</ejb-name>) logujący TransactionSynchronizationRegistry.getTransactionKey() i getTransactionStatus() na wejściu/wyjściu; Synchronization przez TransactionSynchronizationRegistry.registerInterposedSynchronization (beforeCompletion/afterCompletion(status)). |
| Transakcje rozproszone JTA/XA i Spring JtaTransactionManager (Atomikos, Narayana, Bitronix) vs best-effort 1PC | JtaTransactionManager, spring.jta.*, com.atomikos.* (transactions.properties, AtomikosDataSourceBean, UserTransactionManager), narayana.* properties, XADataSource (org.postgresql.xa.PGXADataSource, oracle.jdbc.xa.client.OracleXADataSource, com.mysql.cj.jdbc.MysqlXADataSource), persistence.xml transaction-type="JTA", <xa-datasource> w standalone.xml, ChainedTransactionManager, JmsTransactionManager + DataSourceTransactionManager razem. | Spring: logger org.springframework.transaction.jta.JtaTransactionManager — w aktualnym kodzie DEBUG 'Using JTA UserTransaction: ..' (w starszych wersjach INFO), WARN 'No JTA TransactionManager found: transaction suspension not available' (→ REQUIRES_NEW/NOT_SUPPORTED rzucą TransactionSuspensionNotSupportedException 'JtaTransactionManager needs a JTA TransactionManager for suspending a transaction: specify the 'transactionManager' or 'transactionManagerName' property'); DEBUG standardowe komunikaty APTM. Atomikos: logger com.atomikos (DEBUG; dokładne teksty niezweryfikowane), plik logu tx (tmlog). Narayana: com.arjuna.ats.jta TRACE 'TransactionImple.enlistResource ( .. )' — liczba enlistów >1 = 2PC; com.arjuna.ats.arjuna TRACE BasicAction (prepare / phase2Commit vs onePhaseCommit — teksty do potwierdzenia). | Brak spanów 2PC. Przy XA Connection.commit nie jest wołane → opt-in span JDBC COMMIT się nie pojawi. | Bez zmian: TRACE com.arjuna / DEBUG com.atomikos. Ze zmianą: TransactionSynchronizationRegistry.registerInterposedSynchronization + dekorator XADataSource logujący enlisty. |
| Transakcje w listenerach komunikatów: Kafka, RabbitMQ, JMS DefaultMessageListenerContainer | @KafkaListener, ConcurrentKafkaListenerContainerFactory.getContainerProperties().setKafkaAwareTransactionManager / setTransactionManager, spring.kafka.producer.transaction-id-prefix, KafkaTransactionManager, kafkaTemplate.executeInTransaction(, isolation.level=read_committed; @RabbitListener, setChannelTransacted, RabbitTransactionManager; @JmsListener, DefaultJmsListenerContainerFactory.setSessionTransacted/setTransactionManager, <jms:listener-container acknowledge="transacted">. | logging.level.org.springframework.kafka.transaction.KafkaTransactionManager=DEBUG (komunikaty APTM); org.springframework.kafka.core.DefaultKafkaProducerFactory DEBUG (zweryfikowane w main): '<CloseSafeProducer> beginTransaction()', 'commitTransaction()', 'abortTransaction()', 'sendOffsetsToTransaction({..}, ..)'; org.springframework.kafka.listener.KafkaMessageListenerContainer DEBUG 'Commit list: {..}'. Klient Kafki org.apache.kafka.clients.producer.internals.TransactionManager: przejścia stanów 'Transition from state X to Y' na DEBUG (INFO tylko przy init/ błędach, np. 'ProducerId set to .. with epoch ..', 'Transiting to abortable error state'). Rabbit: org.springframework.amqp.rabbit.transaction.RabbitTransactionManager DEBUG (APTM). JMS: org.springframework.jms.listener.DefaultMessageListenerContainer DEBUG + org.springframework.jms.connection.JmsTransactionManager. | Spany messaging konsumenta/producenta z messaging.system=kafka\|rabbitmq\|jms (nazwy '<topic> process'/'<topic> publish' w starszych semconv, 'process <topic>'/'publish\|send <topic>' w nowszych — zależne od wersji agenta i otel.semconv-stability.opt-in); brak spanów tx Kafki (commitTransaction/sendOffsetsToTransaction). Kolejność publish vs JDBC COMMIT w trace pokazuje dual write. | RecordInterceptor/BatchInterceptor (Spring Kafka) logujący isActualTransactionActive() i getCurrentTransactionName() przed/po listenerze; ProducerListener; dla AMQP setAdviceChain na kontenerze / MessagePostProcessor. |
| Outbox: atomowość zapisu domeny i publikacji (Spring Modulith, Debezium, własna tabela) | Tabela/encja Outbox*, EVENT_PUBLICATION, OutboxEvent, zapis do niej w metodzie @Transactional obok zapisu domeny; @Scheduled poller 'where processed=false'/'SELECT ... FOR UPDATE SKIP LOCKED'; zależności spring-modulith-events-*, spring-modulith-events-kafka/amqp (@Externalized); konfiguracja konektora Debezium. | Spring Modulith: logging.level.org.springframework.modulith.events=DEBUG (rejestracja/zakończenie publikacji — dokładne teksty niezweryfikowane); SQL do event_publication w org.hibernate.SQL / org.springframework.jdbc.core.JdbcTemplate DEBUG 'Executing prepared SQL statement [..]'. Debezium: io.debezium.transforms.outbox w logach Kafka Connect. | Request: span INSERT INTO outbox / event_publication pod spanem serwera; publikacja: osobny trace z pollera (span spring-scheduling '<Klasa>.<metoda>') albo z Kafka Connect (bez kontekstu). Debezium opcjonalnie propaguje kontekst przez ActivateTracingSpan SMT / pole tracingspancontext. | Bez zmian: SQL log + tabela outbox jako dziennik (status, publication_date/completion_date = przesunięcie przebiegu). Ze zmianą: zapis traceparent w kolumnie outbox i odtworzenie kontekstu w pollerze (span link). |
| Batch i harmonogramy: Spring Batch chunk, @Scheduled, Quartz — transakcja per chunk/job, a nie per request | StepBuilder(..).chunk(int, PlatformTransactionManager), <batch:chunk commit-interval=".."/>, .faultTolerant().skip/retry, .transactionAttribute(..), Tasklet, @EnableBatchProcessing; @Scheduled/@EnableScheduling; QuartzJobBean, Job#execute, org.quartz.jobStore.class=org.quartz.impl.jdbcjobstore.JobStoreTX\|JobStoreCMT, spring.quartz.job-store-type=jdbc; @Schedule (EJB). | org.springframework.batch.core.step.tasklet.TaskletStep DEBUG (zweryfikowane w 5.2.x): 'Applying contribution: [StepContribution: read=N, written=N, ...]', 'Saving step execution before commit: ..', 'Rollback for RuntimeException: <klasa>: <msg>', 'Rollback for Error: ..', 'Rollback for Exception: ..'; INFO 'Commit failed while step execution data was already updated. Reverting to old version.'; ERROR 'Rolling back with transaction in unknown state', 'JobRepository failure forcing rollback'. Menedżer tx DEBUG z nazwą tx kroku (zwykle nazwa kroku lub null). org.springframework.batch.core.step.item.FaultTolerantChunkProcessor DEBUG przy skip/scan. Quartz: org.quartz.core.JobRunShell DEBUG 'Calling execute on job ..'. | spring-scheduling: span '<Klasa>.<metoda>' (root trace); quartz-2.0: span z nazwą joba; Spring Batch: instrumentacja spring-batch-3.0 domyślnie WYŁĄCZONA (otel.instrumentation.spring-batch.enabled=true), spany 'BatchJob <job>', 'BatchJob <job>.<step>', 'BatchJob <job>.<step>.Chunk' (item-level opt-in otel.instrumentation.spring-batch.item.enabled). | ChunkListener (beforeChunk/afterChunk/afterChunkError) + ItemWriteListener rejestrowane w definicji kroku; bez zmian: DEBUG TaskletStep + menedżera. Quartz: JobListener/TriggerListener na Scheduler. |
| Spring 2.x/3.x/4.x XML: tx:advice + aop:pointcut, TransactionProxyFactoryBean, Struts + OpenSessionInView | applicationContext*.xml: xmlns:tx, <tx:advice>, <tx:method name= propagation= read-only= rollback-for= no-rollback-for= timeout= isolation=>, <aop:advisor>, <aop:pointcut expression="execution(..)">, TransactionProxyFactoryBean, TransactionInterceptor z transactionAttributes, NameMatchTransactionAttributeSource, MethodMapTransactionAttributeSource, BeanNameAutoProxyCreator, <tx:annotation-driven/>; web.xml <filter-class>org.springframework.orm.hibernate*.support.OpenSessionInViewFilter</filter-class>. Analiza: dopasować AspectJ execution() do klas z grafu i nazwy metod do wzorców tx:method. | Te same komunikaty APTM/TransactionInterceptor (TRACE); org.springframework.transaction.interceptor.NameMatchTransactionAttributeSource DEBUG 'Adding transactional method [save*] with attribute [PROPAGATION_REQUIRED,ISOLATION_DEFAULT,-Exception]' przy starcie — mapa wzorców (logger statyczny NameMatchTransactionAttributeSource.class); HibernateTransactionManager (org.springframework.orm.hibernate3/4/5) DEBUG 'Opened new Session [..] for Hibernate transaction', 'Found thread-bound Session [..] for Hibernate transaction'. Log4j 1.x: log4j.logger.org.springframework.transaction=TRACE, log4j.logger.org.springframework.orm=DEBUG. | brak (jak przy @Transactional); spany servlet/struts (instrumentacja struts-2.3: span '<Action>.<method>'). | Bez zmian w kodzie: logi przy starcie ('Adding transactional method') dają statyczną mapę z runtime; dodanie <aop:advisor> z własnym MethodInterceptor logującym (zmiana XML, bez kodu biznesowego). |
| OpenTelemetry Java agent: co realnie widać z transakcji (JDBC COMMIT/ROLLBACK, Hibernate Transaction.commit, methods include) | -javaagent:opentelemetry-javaagent.jar, OTEL_INSTRUMENTATION_* env, otel.* w application.yaml (starter io.opentelemetry.instrumentation:opentelemetry-spring-boot-starter — tam instrumentacja JDBC przez owinięcie DataSource, zakres flag może się różnić od agenta). | Logback/Log4j2 MDC z agentem: trace_id, span_id (instrumentacja logback-mdc / log4j-context-data, domyślnie włączona w agencie) — pozwala skleić logi DEBUG menedżera tx ze spanami; dodać %X{trace_id} do patternu. | 'Transaction.commit' (hibernate), '<RepoInterface>.<method>' (spring-data), '<Class>.<method>' (methods/WithSpan, spring-scheduling), spany COMMIT/ROLLBACK (jdbc, opt-in). Atrybuty: db.system(.name), db.namespace, db.operation(.name), code.function/code.namespace lub code.function.name (zależnie od semconv), thread.name/thread.id (domyślnie w agencie). | Bez zmian w kodzie: -Dotel.instrumentation.jdbc.experimental.transaction.enabled=true -Dotel.instrumentation.methods.include='org.springframework.transaction.support.AbstractPlatformTransactionManager[getTransaction,commit,rollback];org.springframework.transaction.interceptor.TransactionInterceptor[invoke]' + MDC trace_id w patternie logów. |
| Transakcje w testach: Spring TestContext (@Transactional na teście), MockMvc vs serwer na porcie | @Transactional na klasie/metodzie testu, @DataJpaTest, @JdbcTest, @DataJdbcTest (meta-@Transactional), @Commit, @Rollback(false), @Sql, TestTransaction.flagForCommit()/end(); @SpringBootTest(webEnvironment = RANDOM_PORT) + TestRestTemplate/WebTestClient vs MockMvc; Quarkus @TestTransaction. | logging.level.org.springframework.test.context.transaction=INFO/DEBUG: INFO 'Began transaction (1) for test context [..]; transaction manager [..]; rollback [true]' oraz INFO 'Rolled back transaction for test: [..]' / 'Committed transaction for test: [..]' (logger org.springframework.test.context.transaction.TransactionContext — teksty z kodu, do potwierdzenia w danej wersji); w DEBUG menedżera dla serwisu tylko 'Participating in existing transaction'. | Przy MockMvc brak spanu serwera HTTP (nie przechodzi przez kontener); przy RANDOM_PORT span serwera w innym wątku niż test. | Bez zmian: logi jw. Dla przebiegów produkcyjnych z testu: zdjąć @Transactional z testu, sprzątać danymi (@Sql/truncate) albo użyć RANDOM_PORT; ewentualnie TestTransaction.flagForCommit() + TestTransaction.end() w środku testu. |
| Axon, Micronaut, Quarkus: inne miejsca startu transakcji | Axon: @CommandHandler, @EventHandler, @SagaEventHandler, @ProcessingGroup, axon.eventhandling.processors.<name>.batch-size/mode, TransactionManager bean; Micronaut: io.micronaut.transaction.annotation.Transactional, @ReadOnly, TransactionOperations; Quarkus: @Transactional, @WithTransaction, Panache.withTransaction(, QuarkusTransaction., quarkus.transaction-manager.default-transaction-timeout (domyślnie 60s). | Axon: tx widać przez logger menedżera Springa; błędy handlerów: LoggingErrorHandler na ERROR 'EventListener [..] failed to handle event [..] (..). Continuing processing with next listener'. Micronaut: logger.levels.io.micronaut.transaction: TRACE (application.yml) — zakres komunikatów niezweryfikowany. Quarkus: quarkus.log.category."com.arjuna".level=TRACE (+min-level), quarkus.log.category."io.quarkus.narayana.jta".level=DEBUG, quarkus.hibernate-orm.log.sql=true. | Axon: moduł axon-tracing-opentelemetry ma spany dispatchu komend/zdarzeń i przetwarzania w processorach (nazwy konfigurowalne), brak spanów tx; Micronaut: micronaut-tracing-opentelemetry — brak spanów tx; Quarkus: quarkus-opentelemetry z JDBC (quarkus.datasource.jdbc.telemetry=true) — spany SQL, brak tx. | Axon: MessageHandlerInterceptor na CommandBus/EventProcessor logujący unitOfWork.getMessage() i TransactionSynchronizationManager.isActualTransactionActive(); Micronaut: synchronizacja przez TransactionStatus/registerSynchronization albo własny interceptor (@InterceptorBean); Quarkus: CDI interceptor z @Priority(Interceptor.Priority.PLATFORM_BEFORE + 200 + 1) lub TransactionSynchronizationRegistry.registerInterposedSynchronization. |

### Wyjątki i ich wpływ na przebieg

**Spring AbstractPlatformTransactionManager: granice tx w logach DEBUG (begin/join/suspend/nested/commit/rollback)**

- TransactionExecutionListener NIE jest wołany dla transakcji uczestniczących (Participating) — tylko dla nowych (startTransaction → beforeBegin/afterBegin) i nested z savepointem; commit/rollback tylko w gałęziach status.hasSavepoint() / status.isNewTransaction() (zweryfikowane w main).
  - Jak rozpoznać: W AbstractPlatformTransactionManager.processCommit/processRollback listener odpalany wyłącznie w gałęziach hasSavepoint()/isNewTransaction().
  - Wpływ: Dołączenia metod do istniejącej tx są niewidoczne dla hooka — potrzebny drugi punkt (TRACE TransactionInterceptor albo aspekt), inaczej zgubimy, które metody były w tej samej transakcji.
- Wewnętrzna metoda REQUIRED rzuca RuntimeException, zewnętrzna ją łapie i kończy normalnie → UnexpectedRollbackException 'Transaction silently rolled back because it has been marked as rollback-only'.
  - Jak rozpoznać: Log: 'Participating transaction failed - marking existing transaction as rollback-only', potem 'Global transaction is marked as rollback-only but transactional code requested commit'. Kod: try/catch wokół wywołania beana @Transactional wewnątrz innej metody @Transactional.
  - Wpływ: Po 'Initiating transaction commit' nie będzie commitu, tylko rollback; wynik requestu to wyjątek mimo że kod 'obsłużył' błąd. Gdy globalRollbackOnParticipationFailure=false — znacznik nie jest stawiany.
- Komunikat 'Creating new transaction' z nazwą SimpleJpaRepository.* zamiast metody serwisu.
  - Jak rozpoznać: name zaczyna się od org.springframework.data.*.support.Simple*Repository.
  - Wpływ: Serwis nie jest transakcyjny: każde save() to osobna tx i osobny commit — brak atomowości całego use case'u.
- SUPPORTS / NOT_SUPPORTED / NEVER bez istniejącej tx: APTM nie loguje NIC (ani Creating, ani Participating) — powstaje 'pusta' transakcja tylko z synchronizacją.
  - Jak rozpoznać: TRACE interceptora 'Getting transaction for [..]' bez żadnej linii menedżera; ewentualnie WARN 'Custom isolation level specified but no actual transaction initiated; isolation level will effectively be ignored'.
  - Wpływ: Brak linii nie oznacza braku metody transakcyjnej — SQL w środku idzie w autocommit.
- Kilka menedżerów (dwa DataSource): @Transactional bez qualifiera bierze @Primary/jedyny TransactionManager; zapisy przez drugi DataSource/EntityManagerFactory nie są w tej tx.
  - Jak rozpoznać: Więcej niż jeden bean PlatformTransactionManager; @Transactional bez value przy repozytoriach drugiej bazy; w logu 'Creating new transaction' tylko z jednego loggera menedżera, a SQL do drugiej bazy przez 'Fetching JDBC Connection from DataSource'.
  - Wpływ: Request wygląda na atomowy, a zapis do drugiej bazy jest w autocommit albo w osobnej tx repozytorium.

**Spring @Transactional przez proxy (TransactionInterceptor) — deklaratywne granice i TRACE per metoda**

- Brak @EnableTransactionManagement / <tx:annotation-driven/> w aplikacji nie-Bootowej (Spring 3/4) → @Transactional jest martwą adnotacją.
  - Jak rozpoznać: Brak w configu; brak logów 'Adding transactional method'; brak beana transactionInterceptor / BeanFactoryTransactionAttributeSourceAdvisor.
  - Wpływ: Każda instrukcja w autocommit / per wywołanie repozytorium; statyczny graf pokaże fałszywą granicę.
- Bean tworzony przez new, wywołanie w @PostConstruct/afterPropertiesSet, bean spoza kontekstu → brak proxy.
  - Jak rozpoznać: new XxxService(...) w kodzie; wywołanie metody @Transactional w @PostConstruct (dokumentacja: proxy musi być w pełni zainicjalizowane).
  - Wpływ: Adnotacja ignorowana bez ostrzeżenia.
- Adnotacja tylko na interfejsie: przy proxy JDK działa zawsze, przy CGLIB dopiero od Spring 5.0, w trybie AspectJ nigdy (adnotacje nie dziedziczą się z interfejsów).
  - Jak rozpoznać: @Transactional na interfejsie + proxyTargetClass=true (Boot domyślnie spring.aop.proxy-target-class=true) + Spring <5, albo mode=ASPECTJ.
  - Wpływ: W starym legacy lub w trybie AspectJ brak tx mimo adnotacji.
- Kolejność advisorów: @Retryable, @Cacheable, @Async, własne aspekty vs advisor tx (@EnableTransactionManagement(order) domyślnie LOWEST_PRECEDENCE). Retry na zewnątrz tx = każda próba nową tx; retry wewnątrz tx = ponowienia w tej samej, już rollback-only tx.
  - Jak rozpoznać: @Retryable/@Cacheable na tej samej metodzie co @Transactional; @Order na aspektach; order w @EnableTransactionManagement/@EnableRetry.
  - Wpływ: Liczba 'Creating new transaction' na request zależy od kolejności proxy, nie od kodu metody; przy cache hit tx w ogóle nie startuje.
- Metoda bez atrybutu w beanie z TransactionProxyFactoryBean/BeanNameAutoProxyCreator przechodzi przez interceptor z 'No need to create transaction'.
  - Jak rozpoznać: Linia TRACE 'No need to create transaction for [..]: This method is not transactional.'
  - Wpływ: Wywołanie widać w TRACE, ale nie jest w tx — nie liczyć go jako granicy.

**Self-invocation, metody private/final/static — @Transactional pomijany przez proxy (Spring, EJB); inaczej w Quarkus i Micronaut**

- Kotlin: klasy i metody final domyślnie.
  - Jak rozpoznać: Brak kotlin("plugin.spring") / allopen w build.gradle(.kts) / pom.
  - Wpływ: Spring: błąd przy starcie przy próbie CGLIB albo (przy proxy JDK przez interfejs) działają tylko metody interfejsu; metody final w otwartej klasie cicho bez tx. Quarkus: final zdejmowane automatycznie.
- AspectJ mode odwraca regułę.
  - Jak rozpoznać: mode=ASPECTJ, aop.xml, ajc.
  - Wpływ: Self-invocation tworzy realną granicę — naiwna reguła 'self-call = brak tx' da fałszywy alarm.
- Quarkus/Micronaut: self-invocation jest przechwytywana.
  - Jak rozpoznać: Zależności io.quarkus:quarkus-arc / io.micronaut:micronaut-aop; adnotacja jakarta.transaction.Transactional lub io.micronaut.transaction.annotation.Transactional.
  - Wpływ: this.metodaRequiresNew() faktycznie zawiesza tx i otwiera nową — przebieg inny niż w analogicznym kodzie Springowym.
- EJB 2.x / 3.x: wywołanie lokalnej metody przez this omija kontener, ale wywołanie przez wstrzyknięty @EJB/@Inject tego samego beana — nie.
  - Jak rozpoznać: @Resource SessionContext + getBusinessObject, @EJB private Self self.
  - Wpływ: Atrybut tx działa tylko na ścieżce przez proxy kontenera.

**Reguły rollbacku: checked exceptions, łapanie wyjątków, setRollbackOnly, timeout**

- rollbackForClassName / XML rollback-for / '-Nazwa' dopasowuje PODCIĄG pełnej nazwy klasy (także w 6.x/7.x) — '-Exception' pasuje do prawie wszystkiego, '-BusinessException' także do com.x.NotABusinessExceptionWrapper. Tylko rollbackFor=Klasa.class (od 6.0) jest typowane.
  - Jak rozpoznać: rollbackForClassName / XML rollback-for z krótką nazwą; wersja Springa <6 przy rollbackFor=Class (wtedy też dopasowanie po nazwie).
  - Wpływ: Nieoczekiwany rollback/commit zależny od nazwy wyjątku i wersji Springa.
- Wyjątek rzucony dopiero przy commit (flush → ConstraintViolation, OptimisticLock, deferred constraint).
  - Jak rozpoznać: Stack z JpaTransactionManager.doCommit / 'Initiating transaction rollback after commit exception'.
  - Wpływ: Błąd SQL pojawia się poza metodą, która 'go zrobiła' — przypisanie do kroku przebiegu jest na granicy tx, nie w miejscu save().
- Timeout tx: Spring sprawdza deadline przy pobieraniu zasobu/zapytaniu (ResourceHolderSupport) i ustawia query timeout (JPA/JdbcTemplate); JTA/Narayana reaper anuluje tx asynchronicznie; Quarkus domyślnie 60 s.
  - Jak rozpoznać: @Transactional(timeout=..), TransactionTemplate.setTimeout, quarkus.transaction-manager.default-transaction-timeout, WARN ARJUNA012117 w Narayanie.
  - Wpływ: Rollback w środku metody na pierwszym kolejnym SQL, a nie w miejscu długiej operacji (np. wywołania HTTP).

**Transakcje programowe: TransactionTemplate, PlatformTransactionManager, TransactionalOperator, UserTransaction, QuarkusTransaction, jOOQ, czysty JDBC**

- TransactionCallback nie może rzucić checked — kod opakowuje w RuntimeException albo łapie i woła status.setRollbackOnly(); TransactionTemplate rolluje na KAŻDY RuntimeException/Error (a sneaky-thrown checked → rollback + UndeclaredThrowableException), niezależnie od reguł @Transactional.
  - Jak rozpoznać: try/catch w lambdzie execute, setRollbackOnly().
  - Wpływ: Inna semantyka rollbacku niż w deklaratywnej części tego samego systemu.
- getTransaction bez commit/rollback w finally (wyciek) — zasoby zostają przypięte do ThreadLocal wątku; w puli wątków serwera przechodzą do następnego requestu.
  - Jak rozpoznać: getTransaction( bez pary commit/rollback na każdej ścieżce.
  - Wpływ: Kolejny request 'uczestniczy' w cudzej transakcji (Participating bez Creating).
- Czysty JDBC w aplikacji Springowej (dataSource.getConnection() bez DataSourceUtils) dostaje INNE połączenie z puli niż transakcja Springa.
  - Jak rozpoznać: dataSource.getConnection() w DAO; brak TransactionAwareDataSourceProxy.
  - Wpływ: Kod 'w środku' @Transactional jest poza tą tx (osobny autocommit) — patrz wpis o TransactionAwareDataSourceProxy.

**Transakcje niejawne: autocommit, transakcje na poziomie repozytorium Spring Data, JdbcTemplate/MyBatis bez tx, efekty po stronie bazy**

- Pula z autoCommit=false i brak tx — instrukcje wiszą w niezakomitowanej tx do zwrotu połączenia; Hikari robi rollback przy close, gdy stan commit jest 'dirty'.
  - Jak rozpoznać: spring.datasource.hikari.auto-commit=false bez tx; DEBUG com.zaxxer.hikari.pool.ProxyConnection 'Executed rollback on connection .. due to dirty commit state on close()'.
  - Wpływ: Zapisy znikają po cichu — przebieg pokazuje INSERT, którego w bazie nie ma.
- Deklarowane metody repozytorium (findByX, @Query bez @Modifying) bez @Transactional na interfejsie wykonują się bez tx (każde z osobnym EntityManagerem, gdy nie ma OSIV).
  - Jak rozpoznać: Metody zadeklarowane w interfejsie repo, brak @Transactional na interfejsie/metodzie; brak 'Creating new transaction' z nazwą tej metody.
  - Wpływ: Encje zwrócone przez taką metodę są od razu detached (poza OSIV) → LazyInitializationException dalej w przebiegu.
- Niejawny commit po stronie bazy: DDL w MySQL/Oracle (CREATE/ALTER/TRUNCATE) commituje bieżącą tx; procedury z COMMIT (PostgreSQL 11+ CALL, Oracle) lub PRAGMA AUTONOMOUS_TRANSACTION (Oracle) zatwierdzają niezależnie od tx aplikacji; triggery dopisują zapisy do tej samej tx.
  - Jak rozpoznać: Skrypty DDL w kodzie (np. tworzenie tabel tymczasowych), wywołania procedur, PL/SQL z COMMIT/AUTONOMOUS_TRANSACTION, triggery w schemacie.
  - Wpływ: Rollback w aplikacji nie cofa części zapisów; granica tx z logów Springa nie jest granicą atomowości w bazie.

**Kod JDBC poza transakcją Springa mimo @Transactional: surowy DataSource, TransactionAwareDataSourceProxy, LazyConnectionDataSourceProxy**

- Ten sam kod działa poprawnie po owinięciu DataSource w TransactionAwareDataSourceProxy w XML, a źle w nowym configu Boot (albo odwrotnie).
  - Jak rozpoznać: Definicja proxy tylko w jednym profilu/kontekście.
  - Wpływ: Przebieg zależy od konfiguracji środowiska, nie od kodu.
- Pula wyczerpuje się przy współbieżności, bo request bierze 2 połączenia (tx + surowe).
  - Jak rozpoznać: SQLTransientConnectionException 'Connection is not available, request timed out' przy małej puli.
  - Wpływ: Deadlock puli podobny do REQUIRES_NEW.

**Hibernate/JPA: flush, dirty checking i przesunięcie SQL na granicę commit**

- UPDATE bez wywołania save — przebieg statyczny go nie widzi.
  - Jak rozpoznać: Setter na encji managed w metodzie transakcyjnej; w logu UPDATE po 'Committing JPA transaction on EntityManager'.
  - Wpływ: Zapis trzeba przypisać do encji zmienionej gdziekolwiek w tx, także w metodach wywołanych głębiej.
- JdbcTemplate / czysty JDBC w tej samej tx nie widzi niezflushowanych zmian (Hibernate nie wie o tym zapytaniu). Natywne zapytanie przez EntityManager (createNativeQuery) przy bootstrapie JPA (Spring Data) wyzwala AUTO flush; przy natywnym bootstrapie Hibernate i Session API flush zależy od querySpaces/addSynchronizedEntityClass.
  - Jak rozpoznać: jdbcTemplate.query po persist/setterze w tej samej metodzie @Transactional; native query przez Session.createNativeQuery w aplikacji bez JPA.
  - Wpływ: Kolejność SQL inna niż kolejność w kodzie; odczyt JDBC zwraca stan sprzed zmian.
- hibernate.order_inserts/order_updates i batching łączą/przestawiają instrukcje przy flush.
  - Jak rozpoznać: Te klucze w spring.jpa.properties; w logu batch 'insert ... values (?, ?)' wielokrotnie po flush.
  - Wpływ: Nie da się przypisać kolejności SQL do kolejności wywołań w kodzie.

**readOnly: co faktycznie robi i gdzie jest ignorowane**

- Zapis w tx readOnly znika bez błędu (Hibernate FlushMode.MANUAL).
  - Jak rozpoznać: save()/setter w metodzie wywołanej w kontekście readOnly; brak 'Flushed:' w logu.
  - Wpływ: Przebieg statyczny pokazuje UPDATE, w runtime go nie ma.
- readOnly na metodzie uczestniczącej nie ma efektu.
  - Jak rozpoznać: Metoda readOnly wywołana z tx bez readOnly; log 'Participating in existing transaction'.
  - Wpływ: Nie można z adnotacji wnioskować o routingu na replikę.
- persist() z IDENTITY w tx readOnly: INSERT idzie natychmiast (nie czeka na flush), więc FlushMode.MANUAL go nie zatrzyma — zależnie od sterownika przejdzie albo poleci błąd read-only (pgjdbc readOnlyMode=transaction wysyła BEGIN READ ONLY).
  - Jak rozpoznać: @GeneratedValue(IDENTITY) + save nowej encji w kontekście readOnly.
  - Wpływ: Zachowanie 'readOnly' różne dla nowych i zmienianych encji oraz między bazami.

**NESTED / savepoint i REQUIRES_NEW — wsparcie zależne od menedżera**

- NESTED z JTA lub JPA bez flagi → wyjątek dopiero przy wejściu w metodę NESTED w trakcie istniejącej tx (nie przy deploy; bez zewnętrznej tx w ogóle nie wybucha).
  - Jak rozpoznać: Propagation.NESTED + JpaTransactionManager/JtaTransactionManager w configu; ścieżka wywołania z zewnętrznej @Transactional.
  - Wpływ: Ta sama metoda działa wywołana bezpośrednio z kontrolera i wybucha wywołana z serwisu transakcyjnego.
- SUPPORTS/NOT_SUPPORTED: brak fizycznej tx, ale Spring ustawia synchronizację (SYNCHRONIZATION_ALWAYS) — EntityManager współdzielony w zakresie metody.
  - Jak rozpoznać: Brak 'Creating new transaction', ale TransactionSynchronizationManager.isSynchronizationActive()=true.
  - Wpływ: Lazy loading może działać mimo braku tx; SQL w autocommit.
- NESTED z JPA i włączoną flagą: rollback do savepointu nie czyści Persistence Context — przy commit zewnętrznej flush może ponownie wysłać zmiany 'wycofanych' encji.
  - Jak rozpoznać: setNestedTransactionAllowed(true) na JpaTransactionManager + NESTED zmieniające encje.
  - Wpływ: Zapis, który 'został wycofany', pojawia się w bazie po commit zewnętrznej.

**Lazy loading poza transakcją, Open Session/EntityManager In View**

- OSIV maskuje brak transakcji w HTTP; w jobach/listenerach (bez requestu) ten sam kod rzuca LazyInitializationException.
  - Jak rozpoznać: Ta sama metoda serwisu wołana z @Scheduled/@KafkaListener i z kontrolera.
  - Wpływ: Przebieg zależy od wejścia: z HTTP działa, z kolejki wybucha.
- Lazy load w toString/equals/logowaniu (log.debug("{}", order)).
  - Jak rozpoznać: Lombok @Data/@ToString na encjach z kolekcjami.
  - Wpływ: Dodatkowe SELECTy (N+1) albo wyjątek zależny od poziomu logowania.
- OSIV nie działa dla żądań asynchronicznych MVC (DeferredResult/Callable), WebFlux ani w wątkach @Async — EntityManager jest związany z wątkiem requestu.
  - Jak rozpoznać: Kontroler zwraca CompletableFuture/DeferredResult/Mono z encjami.
  - Wpływ: Lazy load wybucha mimo open-in-view=true.

**Wątki i async gubią transakcję (@Async, executory, reactive, coroutines, Spring Integration channels, EJB @Asynchronous)**

- @Async wołany z @Transactional przed commit czyta dane, których jeszcze nie ma (race), zależnie od timingu.
  - Jak rozpoznać: Wywołanie metody @Async z ID właśnie zapisanej encji w metodzie @Transactional.
  - Wpływ: Niedeterministyczny przebieg (EntityNotFound / pusty wynik); poprawny wzorzec to @TransactionalEventListener(AFTER_COMMIT)+@Async.
- @Async self-invocation (Spring proxy): wywołanie z tej samej klasy jest synchroniczne i w tej samej tx.
  - Jak rozpoznać: this.asyncMethod().
  - Wpływ: Brak nowego wątku i brak nowej tx — odwrotnie niż sugeruje adnotacja.
- Brak @EnableAsync (aplikacja nie-Bootowa lub Boot bez adnotacji) → @Async ignorowane.
  - Jak rozpoznać: Brak @EnableAsync / <task:annotation-driven/>.
  - Wpływ: Metoda wykonuje się synchronicznie w tx wołającego.

**@TransactionalEventListener / TransactionSynchronization — kod po commit, po rollback, przed commit**

- publishEvent poza tx → listener cicho nie odpala.
  - Jak rozpoznać: Log 'No transaction is active - skipping'; publikacja w metodzie bez @Transactional lub z wątku @Async.
  - Wpływ: Krawędź przebiegu (np. wysyłka maila) nie istnieje w runtime.
- Zapis w AFTER_COMMIT bez REQUIRES_NEW (przed Spring 6.1 akceptowane bez błędu) — 'Participating in existing transaction' a potem brak commitu. Przy DataSourceTransactionManager + JdbcTemplate zapis bywa jednak utrwalony, bo cleanup po tx woła Connection.setAutoCommit(true), co wg JDBC zatwierdza trwającą tx (zależne od sterownika).
  - Jak rozpoznać: Listener z @Transactional (REQUIRED) lub bez adnotacji w Spring <6.1; rodzaj menedżera (JPA vs JDBC).
  - Wpływ: Zapis listenera ginie przy JPA, a przy JDBC może przetrwać — wynik zależy od technologii dostępu.
- Wyjątek w listenerze AFTER_COMMIT jest tylko logowany.
  - Jak rozpoznać: ERROR 'TransactionSynchronization.afterCompletion threw exception'.
  - Wpływ: Request kończy się sukcesem, a efekt listenera nie powstał — brak śladu w odpowiedzi.

**Java EE / Jakarta EE: CMT (EJB), BMT, Jakarta @Transactional, MDB — granice i logi Narayana**

- Domyślne REQUIRED bez adnotacji — skaner szukający @Transactional nic nie znajdzie.
  - Jak rozpoznać: @Stateless itp. bez @TransactionAttribute i bez ejb-jar.xml.
  - Wpływ: Cały endpoint jest jedną tx od wejścia; wywołania kolejnych EJB 'dołączają'.
- Checked exception (bez @ApplicationException(rollback=true)) → commit.
  - Jak rozpoznać: throws XxxException w metodzie EJB.
  - Wpływ: Błąd biznesowy u klienta, a dane zapisane.
- MDB z NOT_SUPPORTED lub BMT: ack niezależny od zapisu do bazy.
  - Jak rozpoznać: @TransactionAttribute(NOT_SUPPORTED) na onMessage / BEAN.
  - Wpływ: Duplikaty/utrata wiadomości przy błędach — brak atomowości odbiór+zapis.
- EJB 2.x: atrybuty tx wyłącznie w ejb-jar.xml (często wildcard '*' + wyjątki per metoda), brak adnotacji w kodzie.
  - Jak rozpoznać: javax.ejb.SessionBean, Home/Remote interfejsy, ejb-jar.xml z <container-transaction>.
  - Wpływ: Granice trzeba odczytać z deskryptora; ta sama klasa może mieć inne atrybuty w różnych deploymentach.
- Wywołanie zdalnego EJB (@Remote) między serwerami: propagacja kontekstu tx zależna od serwera (WildFly: przez EJB client, IIOP/JTS) — zdalny bean może dostać nową tx.
  - Jak rozpoznać: @Remote, lookup ejb:/ lub corbaname:, konfiguracja JTS.
  - Wpływ: Dwie niezależne tx zamiast jednej rozproszonej.

**Transakcje rozproszone JTA/XA i Spring JtaTransactionManager (Atomikos, Narayana, Bitronix) vs best-effort 1PC**

- Jeden zasób = 1PC mimo JTA.
  - Jak rozpoznać: Jeden enlistResource w TRACE.
  - Wpływ: Nie raportować '2PC' tylko na podstawie konfiguracji.
- Heurystyczne wyniki (HeuristicMixedException / HeuristicRollbackException) — część zasobów zakomitowana.
  - Jak rozpoznać: Wyjątki javax/jakarta.transaction.Heuristic*Exception, logi recovery.
  - Wpływ: Stan danych niespójny mimo 'transakcji'.
- Nie-XA DataSource w konfiguracji JTA: w WildFly LRCO (w tx, jednofazowo), w Atomikos/Spring standalone — poza tx.
  - Jak rozpoznać: <datasource> zamiast <xa-datasource>; HikariDataSource obok AtomikosDataSourceBean.
  - Wpływ: Zapisy do tej bazy nie cofają się przy rollbacku globalnym (standalone) albo przy awarii po prepare (LRCO).

**Transakcje w listenerach komunikatów: Kafka, RabbitMQ, JMS DefaultMessageListenerContainer**

- Wysyłka do Kafki w @Transactional DB, potem rollback DB — wiadomość już poszła.
  - Jak rozpoznać: kafkaTemplate.send w metodzie @Transactional z JpaTransactionManager i bez transaction-id-prefix; w trace publish przed ROLLBACK.
  - Wpływ: Krawędź do konsumenta mimo rollbacku źródła — potrzebny outbox.
- Retry/redelivery powtarza cały przebieg z nową tx za każdym razem.
  - Jak rozpoznać: DefaultErrorHandler (dawniej SeekToCurrentErrorHandler), BackOff, @RetryableTopic, x-death w Rabbit.
  - Wpływ: Jeden komunikat = N przebiegów; idempotencja decyduje o efekcie.
- Włączenie transakcji Kafki w Boot dodaje bean KafkaTransactionManager — przy auto-konfiguracji warunkowej (@ConditionalOnMissingBean(TransactionManager)) może to zmienić, który menedżer obsługuje @Transactional bez qualifiera (do sprawdzenia w danej wersji Boota).
  - Jak rozpoznać: transaction-id-prefix w konfiguracji + JPA; w logu DEBUG 'Creating new transaction' z loggera KafkaTransactionManager dla metod serwisu.
  - Wpływ: Zapisy JPA mogą się odbywać bez tx bazy, a 'granica' w logu dotyczy Kafki.

**Outbox: atomowość zapisu domeny i publikacji (Spring Modulith, Debezium, własna tabela)**

- 'Outbox' bez wspólnej tx: zapis outbox przez inny DataSource / REQUIRES_NEW / @Async / AFTER_COMMIT listener.
  - Jak rozpoznać: Zapis outbox w metodzie o innej propagacji, innym transactionManager albo w @TransactionalEventListener(AFTER_COMMIT).
  - Wpływ: Brak atomowości — dual write w przebraniu.
- Poller wieloinstancyjny bez blokady — duplikaty publikacji; republish-on-restart w klastrze — ponowna publikacja eventów przetwarzanych przez inną instancję.
  - Jak rozpoznać: Brak FOR UPDATE SKIP LOCKED / ShedLock / @SchedulerLock; republish-outstanding-events-on-restart=true przy wielu instancjach.
  - Wpływ: Jeden zapis → wiele przebiegów konsumenta.
- completion-mode=delete/archive: brak wiersza po zakończeniu.
  - Jak rozpoznać: spring.modulith.events.completion-mode.
  - Wpływ: Tabela nie jest dziennikiem historii; przebieg odtwarzać z SQL logów.

**Batch i harmonogramy: Spring Batch chunk, @Scheduled, Quartz — transakcja per chunk/job, a nie per request**

- Skip/retry w faultTolerant: po błędzie chunk jest rollbackowany i przetwarzany ponownie element po elemencie, każdy w osobnej tx.
  - Jak rozpoznać: .faultTolerant().skip(..)/retry(..), skip-limit w XML.
  - Wpływ: Processor wywołany wielokrotnie dla tego samego elementu — efekty uboczne poza tx (REST, mail) się powtarzają.
- ItemReader czytający poza tx chunku.
  - Jak rozpoznać: JdbcCursorItemReader(useSharedExtendedConnection=false) — własne połączenie; JpaPagingItemReader — własny EntityManager i tx na stronę (transacted=true domyślnie).
  - Wpływ: Odczyt nie widzi zmian writera / ma inną izolację; encje z readera są detached.
- @Scheduled wywołujące metodę tej samej klasy z @Transactional (self-invocation) albo @Scheduled na metodzie @Transactional na beanie bez proxy.
  - Jak rozpoznać: @Scheduled i @Transactional w jednej klasie, wywołanie przez this.
  - Wpływ: Job działa w autocommit, mimo adnotacji.

**Spring 2.x/3.x/4.x XML: tx:advice + aop:pointcut, TransactionProxyFactoryBean, Struts + OpenSessionInView**

- Metoda nie pasująca do żadnego wzorca tx:method, ale w beanie objętym pointcutem → brak tx (NameMatch zwraca null; interceptor loguje TRACE 'No need to create transaction for [..]').
  - Jak rozpoznać: Nazwa metody (np. 'process*') poza listą wzorców.
  - Wpływ: Wywołania DAO w autocommit, mimo że 'serwisy są transakcyjne'.
- Kilka <tx:advice> z różnymi menedżerami (wiele SessionFactory/DataSource).
  - Jak rozpoznać: Kilka <tx:advice transaction-manager=..>.
  - Wpływ: Request może przechodzić przez dwie niezależne tx bez atomowości.
- Najdłuższy wzorzec wygrywa: '*' REQUIRED i 'get*' readOnly — metoda 'getAndUpdate' dostaje readOnly.
  - Jak rozpoznać: Metody zapisujące o nazwach zaczynających się od get*/find*/load*.
  - Wpływ: Zapis cicho przepada (FlushMode.MANUAL) lub błąd read-only.

**OpenTelemetry Java agent: co realnie widać z transakcji (JDBC COMMIT/ROLLBACK, Hibernate Transaction.commit, methods include)**

- XA/JTA commit nie przechodzi przez Connection.commit → brak spanu COMMIT.
  - Jak rozpoznać: XADataSource / JtaTransactionManager.
  - Wpływ: Brak COMMIT ≠ autocommit; potrzebne logi Narayana/Atomikos.
- Spany JDBC w autocommit też nie mają COMMIT — nie odróżnimy autocommit od 'tx bez commitu' bez dodatkowego sygnału.
  - Jak rozpoznać: Brak COMMIT po serii statementów na końcu requestu.
  - Wpływ: Każdy statement = osobna tx albo wyciek tx; wymaga logu DataSourceUtils/Hikari.
- Commit wywołany przez Hibernate w JpaTransactionManager przechodzi przez Connection.commit → przy JPA pojawią się OBA spany: 'Transaction.commit' (Hibernate) i jego dziecko COMMIT (JDBC).
  - Jak rozpoznać: Hibernate + flaga transaction.enabled.
  - Wpływ: Nie liczyć dwóch commitów — to jedna granica.

**Transakcje w testach: Spring TestContext (@Transactional na teście), MockMvc vs serwer na porcie**

- Test przechodzi, bo błąd pojawiłby się dopiero przy flush/commit (constraint, optimistic lock).
  - Jak rozpoznać: @Transactional test bez em.flush(); wyjątek na produkcji z doCommit.
  - Wpływ: Przebieg z testu nie zawiera SQL z flusha ani wyjątku commitu.
- Lazy loading 'działa' w teście, bo tx testu trzyma EntityManager.
  - Jak rozpoznać: Test @Transactional czyta lazy kolekcję po wywołaniu serwisu.
  - Wpływ: Na produkcji (bez OSIV) LazyInitializationException.

**Axon, Micronaut, Quarkus: inne miejsca startu transakcji**

- Axon event handler w trybie streaming/tracking: domyślny ListenerInvocationErrorHandler (LoggingErrorHandler) loguje wyjątek i idzie dalej — tx batcha commituje, token przesuwa się.
  - Jak rozpoznać: Brak konfiguracji ListenerInvocationErrorHandler; w logu ERROR 'EventListener [..] failed to handle event'.
  - Wpływ: Brak zapisu projekcji mimo commit batcha.
- Micronaut @Around(proxyTarget = true) / bean przez interfejs z proxy: wtedy self-invocation NIE jest przechwytywana.
  - Jak rozpoznać: proxyTarget=true w adnotacji around lub w meta-adnotacji.
  - Wpływ: Zachowanie jak w Springu — fałszywa granica przy this.metoda().
- Quarkus reactive: @Transactional (JTA) z Hibernate Reactive nie działa — trzeba @WithTransaction/Panache.withTransaction.
  - Jak rozpoznać: quarkus-hibernate-reactive(-panache) + jakarta.transaction.Transactional.
  - Wpływ: Brak tx lub błąd w runtime; granica w kodzie jest fikcyjna.

## Logi

### Mechanizmy

| Nazwa | Jak rozpoznać statycznie | W logu | W OTel | Wstrzyknięcie |
|---|---|---|---|---|
| Domyślny wzorzec logów Spring Boot (Logback/Log4j2) i obcinanie nazwy wątku | Brak logback.xml / logback-spring.xml / log4j2(-spring).xml w resources i brak logging.config, a jest spring-boot-starter-logging (albo -log4j2): wzorzec domyślny. Własny wzorzec: logging.pattern.console / logging.pattern.file / logging.pattern.level / logging.pattern.dateformat / logging.pattern.correlation; plik: logging.config. | Regex Boot 3+ (konsola i plik): ^(?<ts>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:Z\|[+-]\d\d:\d\d))\s+(?<lvl>[A-Z]+)\s+(?<pid>\d+) --- (?:\[(?<app>[^\]]*)\] )?(?:\[(?<grp>[^\]]*)\] )?\[\s*(?<thread>[^\]]*)\] (?:\[(?<corr>[^\]]*)\] )?(?<logger>\S+)\s+: (?<msg>.*)$ (najpierw usunąć sekwencje ANSI \x1B\[[0-9;]*m). Boot 1.x/2.x: ^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})\s+(\w+) (\d+) --- \[\s*([^\]]*)\] (\S+)\s+: (.*)$ | brak (to sam format; korelacja pojawia się dopiero z Micrometer Tracing albo z agentem OTel) | Bez zmian w kodzie: -Dlogging.pattern.console='... [%t] ...' (pełna nazwa wątku) albo -Dlogging.pattern.level='%5p [%X]' (%X bez klucza wypisuje całe MDC jako k=v). Lepiej ustawiać właściwości logging.pattern.*, a nie systemowe LOG_LEVEL_PATTERN (Boot sam je ustawia z logging.pattern.*). Działa to tylko dla wzorca domyślnego; przy własnym logback-spring.xml tylko wtedy, gdy plik referuje ${CONSOLE_LOG_PATTERN} / include defaults.xml. |
| Correlation ID w Spring Boot 3.2+ (Micrometer Tracing, logging.pattern.correlation) i Sleuth w Boot 1.x/2.x | Zależności io.micrometer:micrometer-tracing-bridge-brave / -bridge-otel, spring-cloud-starter-sleuth; właściwości logging.pattern.correlation, logging.expect-correlation-id, management.tracing.sampling.probability, management.tracing.baggage.correlation.fields, spring.sleuth.default-logging-pattern-enabled. | Boot 3.2+: '\[(?<trace>[0-9a-f]{32})-(?<span>[0-9a-f]{16})\] '; pusty: '\[ {49}\] '. Sleuth 3: '(?<lvl>[A-Z]+) \[(?<app>[^,]*),(?<trace>[0-9a-f]{16,32}),(?<span>[0-9a-f]{16})\]'; Sleuth 1/2: '\[(?<app>[^,]*),(?<trace>[0-9a-f]*),(?<span>[0-9a-f]*),(?<exp>true\|false)?\]'. | Przy bridge-otel observation http.server.requests daje span o nazwie kontekstowej 'http get /orders/{id}' z tagami method, status, uri, outcome, exception i http.url. traceId z logu = trace_id spanu. | Bez kodu: -Dmanagement.tracing.sampling.probability=1.0 (domyślnie 0.1; niesamplowane spany też mają traceId w MDC, ale nie trafiają do eksportera), -Dlogging.pattern.correlation='[%X{traceId:-},%X{spanId:-}] '. Nasz agent może czytać MDC.get("traceId") w punkcie wstrzyknięcia (Micrometer pisze do prawdziwego MDC, inaczej niż agent OTel). |
| Agent OpenTelemetry Java: wstrzykiwanie trace_id/span_id do MDC (logback-mdc, log4j-context-data, log4j-mdc-1.2, jboss-logmanager-mdc) | -javaagent:opentelemetry-javaagent.jar w JAVA_TOOL_OPTIONS / Dockerfile / skryptach startowych / standalone.conf; wzorzec z %mdc{trace_id} lub %X{trace_id}. | Domyślny wzorzec Boot NIE pokaże tych kluczy. Trzeba ustawić np. logging.pattern.level='trace_id=%mdc{trace_id} span_id=%mdc{span_id} trace_flags=%mdc{trace_flags} %5p' (przykład z dokumentacji OTel); regex 'trace_id=(?<t>[0-9a-f]{32}) span_id=(?<s>[0-9a-f]{16})'. | Spany agenta: 'GET /orders/{id}' (http.route), 'SELECT orders' / 'SELECT shop.orders' (db.system, db.statement albo db.query.text zależnie od konwencji), metody tylko przy @WithSpan. Logi mogą też iść appenderem OTel (logback-appender) jako LogRecord ze SpanContext. | Bez kodu: agent + -Dotel.instrumentation.common.logging.trace-id-key=traceId -Dotel.instrumentation.common.logging.span-id-key=spanId ORAZ -Dlogging.pattern.correlation=%correlationId (albo logging.expect-correlation-id=true), jeśli w aplikacji nie ma Micrometer Tracing. Ewentualnie własny wzorzec. -Dotel.instrumentation.logback-mdc.add-baggage=true wystawia baggage jako baggage.<klucz>. |
| Logi strukturalne JSON: Spring Boot 3.4+ (ecs/logstash/gelf), logstash-logback-encoder, Log4j2 JsonTemplateLayout, Quarkus JSON | logging.structured.format.console\|file=ecs\|logstash\|gelf\|<FQCN StructuredLogFormatter>; w logback.xml net.logstash.logback.encoder.LogstashEncoder / LoggingEventCompositeJsonEncoder; w log4j2.xml <JsonTemplateLayout eventTemplateUri="classpath:EcsLayout.json"/>; zależność io.quarkus:quarkus-logging-json, quarkus.log.console.json.*. | Rozpoznanie: linia zaczyna się od '{' i zawiera '"@version":"1"' + '"logger_name"' (logstash) / '"ecs":{"version"' (ECS 3.5+) albo '"ecs.version"' (ECS 3.4) / '"short_message"' + '"version":"1.1"' (GELF) / '"loggerName"' + '"sequence"' (Quarkus). | brak (to format; ECS może zawierać trace.id/span.id, logstash ma traceId/spanId z MDC jako pola płaskie) | Bez kodu: -Dlogging.structured.format.file=logstash -Dlogging.file.name=/tmp/app.json (Boot 3.4+) daje maszynowo czytelny plik obok zwykłej konsoli. Usuwanie i dodawanie pól: logging.structured.json.exclude / rename / add (3.4+). |
| MDC/ThreadContext a pule wątków, @Async, CompletableFuture (utrata i wyciek kontekstu) | @EnableAsync, @Async, implements TaskDecorator, setTaskDecorator(, MDC.getCopyOfContextMap, Slf4jThreadLocalAccessor, CompletableFuture.supplyAsync( bez drugiego argumentu, Executors.newFixedThreadPool, parallelStream(); filtr z MDC.put bez MDC.remove/clear w finally; MDC.putCloseable / CloseableThreadContext (bezpieczne). | Wątki: 'task-1'..'task-8' (Boot ThreadPoolTaskExecutor, spring.task.execution.thread-name-prefix), 'SimpleAsyncTaskExecutor-1' (Spring bez Boota), 'ForkJoinPool.commonPool-worker-1', 'pool-2-thread-3' (Executors). Linia bez requestId/traceId w takim wątku oznacza kontynuację asynchroniczną. | Agent OTel automatycznie propaguje Context przez ExecutorService/ForkJoinPool (instrumentacja executors), więc trace_id agenta przetrwa @Async nawet bez dekoratora. Własne MDC i traceId Micrometera już nie | Agent: instrumentować ThreadPoolExecutor.execute/ForkJoinPool i zapisywać zdarzenie 'submit(taskId, parentThread, parentMdc)' oraz 'run(taskId, workerThread)'. To daje krawędź wątek->wątek bez zmiany kodu. |
| WebFlux/Reactor: log prefix '[<id>] ' zamiast wątku i spring.reactor.context-propagation | spring-boot-starter-webflux, typy zwrotne Mono/Flux w @RestController, RouterFunction, WebClient; Hooks.enableAutomaticContextPropagation(), contextWrite(, spring.reactor.context-propagation. | logging.level.org.springframework.web=DEBUG: 'o.s.w.s.adapter.HttpWebHandlerAdapter : [5a3e8b2f-1] HTTP GET "/orders/1"' i '[5a3e8b2f-1] Completed 200 OK'; regex '^\[(?<logid>[0-9a-f]{1,8}(?:-\d+)?)(?:, L:[^\]]+)?\] '. WebClient: '[3c1f22aa] HTTP GET http://...' (ClientRequest logPrefix = identity hash, inne id niż serwerowe). | Agent OTel: span 'GET /orders/{id}' z instrumentacji spring-webflux + reactor-netty; kontekst idzie przez Reactor Context (instrumentacja reactor-3.1). Micrometer: observation http.server.requests. | Bez kodu: -Dspring.reactor.context-propagation=auto, żeby MDC/traceId wracało w operatorach. Agent: wpinać się w DispatcherHandler.handle / HandlerAdapter, czytając exchange.getLogPrefix() i dopisując go do naszych zdarzeń jako klucz korelacji. |
| Nazwy wątków jako sygnał typu wejścia (Tomcat, Jetty, Undertow/WildFly, Netty, Kafka, Rabbit, @Scheduled, Quartz, wirtualne wątki) | server.tomcat.threads.max, spring.threads.virtual.enabled, @KafkaListener(id=...) (id zastępuje wygenerowaną nazwę), @RabbitListener, spring.rabbitmq.listener.type=direct, spring.task.*.thread-name-prefix, org.quartz.threadPool.threadNamePrefix, SchedulerFactoryBean.setTaskExecutor, ThreadFactory/CustomizableThreadFactory w kodzie. | Regexy: '^http-(nio\|nio2\|apr)-\d+-exec-\d+$' -> HTTP servlet; '^https?-jsse-nio-\d+-exec-\d+$' -> HTTPS; '^tomcat-handler-\d+$' -> HTTP na wątkach wirtualnych; '^(default\|XNIO-\d+) task-\d+$' -> Undertow/WildFly HTTP; '-C-\d+$' -> Kafka consumer; 'RabbitListenerEndpointContainer#' -> AMQP (SMLC); '^scheduling-\d+$' -> @Scheduled (Boot); '_Worker-\d+$' -> Quartz; '^reactor-http-(nio\|epoll\|kqueue)-\d+$' -> WebFlux event loop. | Atrybuty thread.id / thread.name na spanach dodaje ThreadDetailsSpanProcessor agenta (otel.javaagent.add-thread-details): domyślnie true w agencie 1.x-2.32, domyślnie false w trybie v3-preview i w gałęzi main (3.0). Spany messaging (stare konwencje): 'orders publish' / 'orders process' (messaging.system=kafka\|rabbitmq); przy stabilnych konwencjach 'send orders' / 'process orders'. | W naszym zdarzeniu zapisywać Thread.currentThread().getName() ORAZ threadId() (Java 19+; wcześniej getId()) oraz isVirtual(). Nazwa bywa pusta lub zmieniana w trakcie, a id nie. |
| Asynchroniczne appendery: utrata zdarzeń, brak caller data, nazwa wątku z cache | <appender class="ch.qos.logback.classic.AsyncAppender"> (queueSize, discardingThreshold, neverBlock, includeCallerData, maxFlushTime); log4j2.contextSelector=org.apache.logging.log4j.core.async.AsyncLoggerContextSelector, <AsyncLogger>, <AsyncRoot>, <Async>, log4j2.asyncQueueFullPolicy; logging.properties z org.apache.juli.AsyncFileHandler. | Luki: przy obciążeniu znikają linie DEBUG/INFO, a WARN zostają. Placeholdery '?' w polach lokalizacji. W catalina.out / catalina.<data>.log: 'Unknown thread with ID 123'. | brak | Nasze logi diagnostyczne NIE powinny iść przez appender asynchroniczny aplikacji. Najlepiej osobny, synchroniczny writer (patrz wpis o osobnym pliku), a jeśli przez Logback, to z discardingThreshold=0 i neverBlock=false albo bez Async. |
| Kierowanie NASZYCH logów diagnostycznych do osobnego pliku | Czy aplikacja ma własny logback-spring.xml / logback.xml / log4j2.xml / standalone.xml subsystem logging; czy jest jul-to-slf4j (SLF4JBridgeHandler) albo log4j-to-slf4j (mosty, którymi nasze logi mogą wrócić do pliku aplikacji). | Nasz format: JSON Lines z polami ts_epoch_nanos (Instant.now() + System.nanoTime() do kolejności), seq (AtomicLong), host, pid, thread_name, thread_id, virtual, mdc (kopia), trace_id (Span.current(), jeśli jest OTel), event (enter/exit/sql/tx/submit/run), class, method. | brak | Boot: -Dlogging.config=file:/x/flowlens-logback.xml CAŁKOWICIE zastępuje konfigurację aplikacji; trzeba w nim zrobić <include resource="org/springframework/boot/logging/logback/base.xml"/> albo skopiować oryginał. Boot nie zarządza logback.configurationFile (docs) i przy inicjalizacji resetuje LoggerContext, więc w praktyce ta właściwość nie działa. <include optional="true" file="..."/> pomaga tylko, jeśli plik aplikacji to przewiduje. Micronaut: -Dlogback.configurationFile działa (po resecie Logback jest konfigurowany od nowa według standardowego wyszukiwania Logbacka). Dlatego wariant A jest pewniejszy. |
| Logi SQL i transakcji jako kroki przebiegu (Hibernate, JdbcTemplate, Spring TX, MyBatis, jOOQ) | logging.level.org.hibernate.SQL, spring.jpa.show-sql, hibernate.show_sql, hibernate.highlight_sql, mybatis.configuration.log-impl, logging.level.sql=DEBUG (grupa Boot), p6spy / datasource-proxy w zależnościach. | Regexy: 'Creating new transaction with name \[(?<method>[\w.$]+)\]: (?<prop>PROPAGATION_\w+)'; 'Getting transaction for \[(?<m>[^\]]+)\]'; '==>\s+Preparing: (?<sql>.*)' (logger = namespace.statementId); 'Executing prepared SQL statement(?: \[(?<sql>.*)\])?'. | Agent: spany JDBC 'SELECT orders' / 'SELECT shop.orders' z db.system, db.statement (stare konwencje) / db.query.text (nowe), db.operation; Hibernate: spany 'Session.find com.x.Order', 'Transaction.commit'; Spring Data: 'OrderRepository.findById'. | Bez kodu: -Dlogging.level.org.springframework.orm.jpa.JpaTransactionManager=DEBUG -Dlogging.level.org.springframework.jdbc.support.JdbcTransactionManager=DEBUG -Dlogging.level.org.springframework.jdbc.datasource.DataSourceTransactionManager=DEBUG -Dlogging.level.org.springframework.transaction.interceptor=TRACE -Dlogging.level.sql=DEBUG. Zdarzenia SQL lepiej jednak łapać agentem na java.sql.Connection.prepareStatement / Statement.execute* (działa dla czystego JDBC, MyBatis, jOOQ, Querydsl). |
| Logi wejścia HTTP w Spring MVC: DispatcherServlet, 'Mapped to', CommonsRequestLoggingFilter (Spring 4.x i 5.1+) | logging.level.web=DEBUG / logging.level.org.springframework.web=DEBUG; spring.mvc.log-request-details=true (pełne parametry i nagłówki); bean CommonsRequestLoggingFilter; własne OncePerRequestFilter z MDC.put("requestId"/"correlationId", request.getHeader("X-Request-ID")). | Regexy 5.1+: 'DispatcherServlet\s+: (?<method>GET\|POST\|PUT\|DELETE\|PATCH) "(?<uri>[^"]+)"'; 'Mapped to (?<handler>[\w.$]+)#(?<method>\w+)\((?<args>[^)]*)\)'; 'Completed (?<status>\d{3})'; 'Before request \[(?<req>[^\]]+)\]'. Stare: 'processing (?<method>\w+) request for \[(?<uri>[^\]]+)\]'; 'Returning handler method \[(?<sig>[^\]]+)\]'. | Span 'GET /orders/{id}' z http.route. Span kontrolera 'OrderController.get' (INTERNAL) w agencie 2.x tylko po otel.instrumentation.common.experimental.controller-telemetry.enabled=true (domyślnie false; w 1.x był domyślnie włączony). | Bez kodu: -Dlogging.level.org.springframework.web.servlet.DispatcherServlet=DEBUG -Dlogging.level.org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping=DEBUG. Agent: HandlerAdapter.handle / InvocableHandlerMethod.invokeForRequest z nadaniem własnego request id i wpisaniem go do MDC (wtedy nasze id pojawia się też w liniach aplikacji, jeśli wzorzec ma %X). |
| Access log Tomcata/Undertow/Quarkus jako kotwica requestu (%I wątek, %D czas, nagłówki id) | server.tomcat.accesslog.enabled=true, server.tomcat.accesslog.pattern, server.tomcat.accesslog.directory, server.tomcat.basedir; server.xml <Valve className="org.apache.catalina.valves.AccessLogValve" pattern=...>; server.undertow.accesslog.*; quarkus.http.access-log.enabled. | Domyślny 'common' = '%h %l %u %t "%r" %s %b', bez wątku i czasu trwania. Zalecany: '%{begin:yyyy-MM-dd'T'HH:mm:ss.SSS}t %I %{ms}T %{X-Request-ID}i "%r" %s'. Regex: '^(?<start>\S+) (?<thread>\S+) (?<ms>\d+) (?<rid>\S+) "(?<m>\w+) (?<uri>\S+)'. | brak (osobny log, nie span) | Bez kodu: -Dserver.tomcat.accesslog.enabled=true -Dserver.tomcat.accesslog.pattern="%{begin:yyyy-MM-dd'T'HH:mm:ss.SSS}t %I %{ms}T %{X-Request-ID}i %r %s" -Dserver.tomcat.accesslog.directory=/tmp/flowlens (ścieżka bezwzględna). Jest to osobny plik z natury rzeczy. |
| Java EE / Jakarta EE (WildFly, JBoss EAP): format JBoss LogManager, EJB, JTA, MDB | @Stateless/@Stateful/@Singleton, @MessageDriven(activationConfig=destinationLookup), @TransactionAttribute(REQUIRES_NEW), @Asynchronous, ejb-jar.xml, jboss-deployment-structure.xml (<exclude-subsystems><subsystem name="logging"/>), standalone.xml <subsystem xmlns="urn:jboss:domain:logging:...">, use-deployment-logging-config, add-logging-api-dependencies. | Regex: '^(?<ts>\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3}) (?<lvl>\w+)\s+\[(?<logger>[^\]]+)\] \((?<thread>[^)]+)\) (?<msg>.*)'. Przecinek przed milisekundami; konsola bez daty. | WildFly 25+ ma subsystem opentelemetry, a 28+ MicroProfile Telemetry: spany serwerowe HTTP/JAX-RS z route (np. 'GET /app/orders/{id}'). Agent OTel: spany EJB nie są domyślne, JMS: '<kolejka> process' (messaging.system=jms). Agent ma też instrumentację jboss-logmanager-mdc (trace_id w %X). | Bez kodu (jboss-cli.sh): osobny handler i logger z use-parent-handlers=false (patrz wpis o osobnym pliku); dodanie %X{...} do formattera: /subsystem=logging/pattern-formatter=PATTERN:write-attribute(name=pattern,value="%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p [%c] (%t) %X{traceId} %s%e%n"). |
| Quarkus i Micronaut: JBoss LogManager, Vert.x duplicated context, MdcPropagationContext | application.properties: quarkus.log.console.format, quarkus.log.category."x".level; @Blocking/@NonBlocking/@RunOnVirtualThread, Uni/Multi; Micronaut: @ExecuteOn(TaskExecutors.BLOCKING), logback.xml w resources, logger.levels.*, logger.config, PropagatedContext. | Quarkus regex: '^(?<ts>\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3}) (?<lvl>\w+)\s+\[(?<logger>[^\]]+)\] \((?<thread>[^)]+)\) (?<msg>.*)'; z OTel dodać do formatu 'traceId=%X{traceId}'. | Quarkus OTel: spany 'GET /orders/{id}', JDBC 'SELECT db.orders' przy quarkus.datasource.jdbc.telemetry=true; Micronaut: micronaut-tracing-opentelemetry, spany HTTP. | Bez kodu: -Dquarkus.log.console.format='%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p traceId=%X{traceId} [%c] (%t) %s%e%n' (właściwość runtime, bez przebudowy). Micronaut: -Dlogback.configurationFile=... albo logger.config=... Gdy ustawiono jakąkolwiek właściwość logger.*, Micronaut resetuje Logback przy starcie i przy refresh, ale potem konfiguruje go według logback.configurationFile, więc plik działa. |
| Identyfikatory 'korelacji' w messagingu, które NIE są trace id (Axon traceId/correlationId, JMSCorrelationID, Spring Integration, Kafka headers) | Axon: @CommandHandler, @EventHandler, @SagaEventHandler, CorrelationDataProvider, MessageOriginProvider, SimpleCorrelationDataProvider; JMS: setJMSCorrelationID; Spring Integration: IntegrationMessageHeaderAccessor.CORRELATION_ID, @Aggregator, <int:wire-tap>, <int:logging-channel-adapter>; Kafka: observation-enabled. | Axon nie loguje metadanych domyślnie. org.axonframework.messaging.interceptors.LoggingInterceptor loguje tylko prostą nazwę typu payloadu: 'Incoming message: [PlaceOrder]', '[PlaceOrder] executed successfully with a [...] return value', 'Dispatched messages: [OrderPlaced]'. Do metadanych potrzebny własny MessageHandlerInterceptor logujący message.getMetaData(). Regex UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'. | Axon 4.6+ (axon-tracing-opentelemetry) ma własne spany dla dispatch/handle komend i przetwarzania zdarzeń; dokładne nazwy (np. 'CommandBus.dispatchCommand(PlaceOrder)') zależą od wersji (4.6-4.8 vs 4.9+ z SpanFactory per komponent). Kafka (agent, stare konwencje): 'orders publish' / 'orders process' z messaging.kafka.consumer.group, messaging.kafka.message.offset. | Agent: w punkcie wysyłki (KafkaTemplate.send, RabbitTemplate.convertAndSend, JmsTemplate.send, CommandGateway.send) zapisać (wątek, nasze request id, id komunikatu/offset/messageId), a w listenerze odczytać to samo. Daje to krawędź asynchroniczną bez OTel. |
| JAX-WS/SOAP (Apache CXF LoggingFeature): ExchangeId w MDC tylko na czas jednej linii | @WebService, @WebMethod, cxf-servlet.xml / <jaxws:endpoint> w Spring XML, <jaxws:features><bean class="org.apache.cxf.ext.logging.LoggingFeature"/>, @Features(features="org.apache.cxf.ext.logging.LoggingFeature"). | Logger regex 'org\.apache\.cxf\.services\.(?<port>[\w$]+)\.(?<type>REQ_IN\|RESP_OUT\|REQ_OUT\|RESP_IN\|FAULT_OUT\|FAULT_IN)'; z %X: 'ExchangeId=(?<ex>[0-9a-f-]{36})'. | Agent: instrumentacje jaxws/cxf nadają spanowi serwerowemu nazwę '<Service>/<operation>' (np. 'OrderService/placeOrder'); zestaw atrybutów (code.* / rpc.*) zależy od wersji, nie sprawdzony. | Bez kodu: logging.level.org.apache.cxf.services=INFO oraz %X we wzorcu. Agent: w interceptorze Phase.RECEIVE zapisać ExchangeId z wątkiem, a w Phase.SEND domknąć. |
| Korelacja linii bez id (wątek + czas) i gdzie zawodzi; wiele instancji JVM | JUL logging.properties z java.util.logging.SimpleFormatter.format (domyślnie BEZ nazwy wątku: '%1$tb %1$td, %1$tY %1$tl:%1$tM:%1$tS %1$Tp %2$s%n%4$s: %5$s%6$s%n'); Tomcat catalina.out z org.apache.juli.OneLineFormatter ('dd-MMM-yyyy HH:mm:ss.SSS LEVEL [thread] klasa.metoda msg'); wzorce bez %t/%thread. | Kontrola jakości korelacji: (1) w segmencie pojawia się drugie zdarzenie wejścia bez zakończenia poprzedniego, czyli przeplot; (2) parametr z URI (np. id=1) nie występuje w SQL segmentu; (3) różne requestId w MDC w jednym segmencie. | brak (to metoda zastępcza dla braku OTel) | Nasze zdarzenia z seq (globalny AtomicLong), thread_id, nanoTime, a dla pul zdarzenia submit/run z id zadania. To zamienia heurystykę na pewną krawędź. Dla linii aplikacji bez wątku (JUL SimpleFormatter, System.out) jedyny ratunek to inny Formatter: SimpleFormatter.format nie ma pola wątku, więc trzeba podmienić Formatter (np. OneLineFormatter) albo przejść na jul-to-slf4j. |
| Routing logów w legacy: JCL, Log4j 1.x, JUL, mosty SLF4J i pliki Tomcata (gdzie naprawdę trafia linia) | log4j.properties / log4j.xml (Log4j 1), commons-logging.properties, logging.properties (JUL/Tomcat), zależności slf4j-log4j12 / slf4j-reload4j / logback-classic / log4j-slf4j-impl / log4j-slf4j2-impl / jul-to-slf4j / log4j-over-slf4j; SLF4JBridgeHandler.install() w kodzie; -Djava.util.logging.manager=... | Ostrzeżenia startowe: 'SLF4J: Class path contains multiple SLF4J bindings.', 'SLF4J: Failed to load class "org.slf4j.impl.StaticLoggerBinder"' (1.7, NOP: wszystko znika), 'SLF4J(W): No SLF4J providers were found.' (2.x), 'Detected both log4j-over-slf4j.jar AND bound slf4j-log4j12.jar on the class path, preempting StackOverflowError.', 'log4j:WARN No appenders could be found for logger (...)'. | Agent OTel ma osobne instrumentacje MDC dla log4j 1.2, logback, log4j2 i jboss-logmanager; JUL nie ma MDC, więc linie z JUL nie dostaną trace_id | Bez kodu: przed analizą zebrać listę wszystkich plików (catalina.*, localhost.*, catalina.out, plik aplikacji, server.log) i znaleźć linie startowe SLF4J/log4j. Agent: zapisać przy starcie, które klasy są załadowane (org.slf4j.impl.StaticLoggerBinder, ch.qos.logback.classic.LoggerContext, org.apache.log4j.LogManager), co jednoznacznie pokazuje backend. |
| Wejścia batch i job w logach: Spring Batch, Quartz, Spring @Scheduled | @EnableBatchProcessing, Job/Step beany, JobLauncher, spring.batch.job.name; Quartz: implements Job / QuartzJobBean, SchedulerFactoryBean, spring.quartz.*; @Scheduled(cron/fixedRate), @EnableScheduling. | Regexy: 'Job: \[(?<job>.+?)\] launched with the following parameters: \[(?<params>.*)\]'; 'Executing step: \[(?<step>[^\]]+)\]'; 'Step: \[(?<step>[^\]]+)\] executed in (?<dur>\S+)'; 'Calling execute on job (?<group>[^.]+)\.(?<name>\S+)'. | Agent: Quartz ma instrumentację (span '<JobClass>.execute' albo z nazwą joba), Spring Batch: spany joba/stepu tylko przy włączonej instrumentacji spring-batch (domyślnie wyłączona w agencie 2.x); @Scheduled: span 'OrderJob.run' z instrumentacji spring-scheduling. Nazwy niesprawdzone per wersja. | Bez kodu: -Dlogging.level.org.quartz.core.JobRunShell=DEBUG; logi Spring Batch są na INFO domyślnie. Dla @Scheduled jedyny pewny sygnał to nasz agent na metodach z @Scheduled (enter/exit z wątkiem). |

### Wyjątki i ich wpływ na przebieg

**Domyślny wzorzec logów Spring Boot (Logback/Log4j2) i obcinanie nazwy wątku**

- Obcięta nazwa wątku na konsoli: różne prefiksy dla exec-1 i exec-10, a dwa różne wątki mogą mieć identyczne ostatnie 15 znaków (np. @KafkaListener(id="orders-listener") i id="payments-listener" dają oba '-listener-0-C-1')
  - Jak rozpoznać: W nawiasach dokładnie 15 znaków wyrównanych do prawej. Wtedy czytać plik (logging.file.name), w którym jest pełne %t
  - Wpływ: Korelacja wątek+czas skleja obce linie
- Linia wielowierszowa (stack trace %wEx, sformatowany SQL z hibernate.format_sql) nie zaczyna się od znacznika czasu
  - Jak rozpoznać: Linie zaczynające się od '\tat ', 'Caused by:', '\t... N more' albo bez prefiksu daty
  - Wpływ: Parser musi doklejać takie linie do poprzedniego zdarzenia, inaczej powstają fałszywe kroki
- Boot 1.x/2.x nie zapisuje strefy czasowej w znaczniku czasu
  - Jak rozpoznać: Data ze spacją, bez 'T' i offsetu
  - Wpływ: Łączenie z logami innych źródeł (DB, access log, logi w UTC) daje przesunięcie o godziny
- Kody kolorów ANSI z %clr: przy spring.output.ansi.enabled=always albo detect na terminalu/IDE linia zawiera sekwencje ESC[..m wokół pól
  - Jak rozpoznać: Znaki \x1B[2m, \x1B[36m itp. w surowym logu (często przy logach skopiowanych z konsoli IDE)
  - Wpływ: Sztywne regexy nie trafiają; trzeba najpierw usunąć ANSI
- Różne progi dla konsoli i pliku (logging.threshold.console / logging.threshold.file) albo różne appendery: konsola i plik nie zawierają tych samych linii
  - Jak rozpoznać: Właściwości logging.threshold.* albo w pliku są linie DEBUG, których nie ma na konsoli
  - Wpływ: Przebieg złożony z jednego źródła jest niepełny; wybrać źródło z najniższym progiem

**Correlation ID w Spring Boot 3.2+ (Micrometer Tracing, logging.pattern.correlation) i Sleuth w Boot 1.x/2.x**

- Sam traceId nie wystarcza do odtworzenia przebiegu: spanId zmienia się przy każdej observation (JDBC z datasource-micrometer, RestTemplate/RestClient), a kod bez observation dziedziczy span rodzica
  - Jak rozpoznać: Ten sam traceId przy różnych spanId w jednym wątku
  - Wpływ: Grupować po traceId, a spanId traktować jako zagnieżdżenie, nie jako krok
- Brak correlation id w liniach z wątków bez propagacji (@Async bez ContextPropagatingTaskDecorator, własne ExecutorService)
  - Jak rozpoznać: Pusty blok '[ ... ]' w wątku task-N albo pool-N-thread-M tuż po linii z traceId
  - Wpływ: Kontynuację trzeba wiązać heurystycznie (czas, parametry) albo przez nasz wstrzyknięty log w miejscu submit
- Własny logging.pattern.correlation z ${spring.application.name} przy włączonym logging.include-application-name (domyślnie true) daje nazwę aplikacji dwa razy
  - Jak rozpoznać: '[app] [ ... ] [app,trace,span]'
  - Wpływ: Kosmetyka, ale psuje sztywne regexy
- Sleuth/Brave domyślnie generuje 64-bitowe trace id (16 hex), a Boot 3 z Brave i OTel 128-bitowe (32 hex)
  - Jak rozpoznać: traceId 16 znaków w logach starych serwisów, 32 w nowych; przy propagacji 64-bit może być dopełniony zerami
  - Wpływ: Regex {32} gubi stare serwisy; przy łączeniu serwisów porównywać ostatnie 16 znaków
- Boot 3.0-3.1 z Micrometer Tracing nie pokazuje id w logu, dopóki ktoś nie ustawi logging.pattern.level
  - Jak rozpoznać: Wersja Boot 3.0/3.1 i brak %X{traceId} we wzorcu
  - Wpływ: Id jest w MDC, ale nie w pliku; pomaga -Dlogging.pattern.level='%5p [%X{traceId:-},%X{spanId:-}]'

**Agent OpenTelemetry Java: wstrzykiwanie trace_id/span_id do MDC (logback-mdc, log4j-context-data, log4j-mdc-1.2, jboss-logmanager-mdc)**

- Konflikt nazw: aplikacja z Micrometer (traceId) i agentem OTel (trace_id) ma w MDC dwa różne identyfikatory, jeśli bridge nie jest spięty z agentem
  - Jak rozpoznać: W linii są oba klucze o różnych wartościach
  - Wpływ: Grupowanie po złym kluczu rozbija jeden request na dwa
- Nasz własny logger/appender odczytujący MDC z kodu (MDC.get) nie widzi wartości wstrzykniętych przez agenta
  - Jak rozpoznać: Puste pola w naszym pliku diagnostycznym, a pełne w logu aplikacji
  - Wpływ: Trzeba czytać Span.current().getSpanContext() z API OTel albo formatować przez wzorzec Logback
- Blok %correlationId Boota pojawia się tylko, gdy logging.expect-correlation-id=true (ustawiane automatycznie wyłącznie przy Micrometer Tracing na classpath). Sama zmiana trace-id-key=traceId przy samym agencie nic nie pokazuje
  - Jak rozpoznać: Brak micrometer-tracing w zależnościach i brak logging.pattern.correlation
  - Wpływ: Fałszywy wniosek, że agent nie działa
- Logi przez JUL (java.util.logging, Tomcat JULI w catalina.out) nie mają MDC, więc nie dostaną trace_id
  - Jak rozpoznać: Linie z loggerów org.apache.catalina.* / JUL bez id, a obok linie SLF4J z id
  - Wpływ: Linie kontenera trzeba wiązać wątkiem i czasem

**Logi strukturalne JSON: Spring Boot 3.4+ (ecs/logstash/gelf), logstash-logback-encoder, Log4j2 JsonTemplateLayout, Quarkus JSON**

- logstash-logback-encoder dokleja argumenty StructuredArguments (kv(...)), a fluent API SLF4J 2 addKeyValue jako pola na najwyższym poziomie, co może zderzyć się z nazwą pola MDC
  - Jak rozpoznać: Pola spoza standardowego zestawu na najwyższym poziomie JSON
  - Wpływ: Nie traktować dowolnego pola 'id' jako request id
- Stack trace w JSON siedzi w jednym polu (stack_trace / error.stack_trace), więc nie ma linii wielowierszowych, ale od Boot 3.5 bywa przycinany (logging.structured.json.stacktrace.max-length / max-throwable-depth)
  - Jak rozpoznać: Pole urwane albo z pominiętymi ramkami
  - Wpływ: Głębokie ramki (np. SQL wewnątrz) mogą zniknąć
- ECS w Boot 3.4 ma płaskie klucze z kropkami, a w 3.5+ zagnieżdżone obiekty: ta sama aplikacja po podbiciu wersji zmienia kształt JSON
  - Jak rozpoznać: '"log.level"' (3.4) vs '"log":{"level"' (3.5+)
  - Wpływ: Parser oczekujący jednej postaci gubi wszystkie linie
- Quarkus JSON domyślnie zagnieżdża MDC w obiekcie 'mdc', więc traceId z quarkus-opentelemetry jest pod mdc.traceId, a nie na najwyższym poziomie
  - Jak rozpoznać: Obiekt "mdc":{...} w linii
  - Wpływ: Szukanie traceId na najwyższym poziomie nic nie znajduje

**MDC/ThreadContext a pule wątków, @Async, CompletableFuture (utrata i wyciek kontekstu)**

- Wyciek MDC: brak czyszczenia w puli Tomcata albo w puli @Async
  - Jak rozpoznać: Ten sam requestId w dwóch żądaniach o różnych URI, oddalonych o sekundy, na tym samym wątku
  - Wpływ: Sklejenie dwóch przebiegów w jeden
- Dekorator propaguje, ale nie przywraca: po zadaniu wątek puli zostaje z cudzym MDC
  - Jak rozpoznać: Własny TaskDecorator bez finally { MDC.clear() } albo bez przywrócenia poprzedniej mapy
  - Wpływ: Kolejne zadania na tym wątku dziedziczą fałszywy kontekst
- Log4j2 z isThreadContextMapInheritable: kopia z wątku TWORZĄCEGO wątek puli, a nie zlecającego zadanie
  - Jak rozpoznać: W wątkach roboczych wartość z czasu utworzenia wątku
  - Wpływ: Stała, nieaktualna wartość kontekstu
- parallelStream() wykonuje część elementów na wątku wywołującym, a część na ForkJoinPool.commonPool-worker-N
  - Jak rozpoznać: W jednej operacji część linii ma MDC (wątek http-nio-...), część nie (commonPool)
  - Wpływ: Połowa kroków wygląda na należącą do requestu, połowa na osieroconą

**WebFlux/Reactor: log prefix '[<id>] ' zamiast wątku i spring.reactor.context-propagation**

- Korelacja wątek+czas na event loop jest fałszywa: przeplatające się requesty na tym samym 'reactor-http-nio-2'
  - Jak rozpoznać: Kilka różnych logId w kilku milisekundach na jednym wątku
  - Wpływ: Naiwny parser przypisze SQL R2DBC / wywołanie WebClient do złego requestu
- Logi samego Reactor Netty (reactor.netty.http.server.*) mają id '[5a3e8b2f-1, L:/... - R:/...]', w którym liczba to numer requestu NA POŁĄCZENIU, a logi Springa dla tego samego requestu mają globalny licznik ('[5a3e8b2f-17]')
  - Jak rozpoznać: Ten sam hash kanału, różne sufiksy w loggerach reactor.netty.* i org.springframework.web.*
  - Wpływ: Łączyć tylko po hashu kanału + czasie albo normalizować; nie porównywać sufiksów między warstwami
- Kolejne requesty keep-alive z jednego połączenia mają wspólny hash kanału
  - Jak rozpoznać: Ten sam 8-znakowy hash z różnymi sufiksami
  - Wpływ: Nie sklejać po samym hashu kanału
- WebFlux na Tomcat/Jetty/Undertow (nie Netty): id = ObjectUtils.getIdentityHexString(request), 1-8 znaków hex, bez '-N'
  - Jak rozpoznać: Prefiks '[1a2b3c]' bez myślnika, wątki http-nio-* zamiast reactor-http-*
  - Wpływ: Regex z {8}-\d+ nie trafia; id może się powtórzyć po GC

**Nazwy wątków jako sygnał typu wejścia (Tomcat, Jetty, Undertow/WildFly, Netty, Kafka, Rabbit, @Scheduled, Quartz, wirtualne wątki)**

- Wirtualne wątki tworzone bez nazwy (Executors.newVirtualThreadPerTaskExecutor(), Thread.ofVirtual().unstarted) mają nazwę pustą ''
  - Jak rozpoznać: Na konsoli Boota 15 spacji '[               ]', w pliku '[]', w JSON thread_name=""
  - Wpływ: Korelacja po wątku niemożliwa, a każde zadanie to osobny wątek
- Aplikacja zmienia nazwę wątku (Thread.setName w filtrze, np. dopisuje URI albo userId), co zdarza się w legacy
  - Jak rozpoznać: Nazwa wątku zawiera URL/ID
  - Wpływ: Ta sama fizyczna nitka ma różne nazwy; plus: nazwa staje się korelatorem
- Request async servlet (DeferredResult/Callable) albo z keep-alive na wątkach wirtualnych przechodzi przez kilka wątków 'tomcat-handler-N'
  - Jak rozpoznać: Kolejne N dla tego samego URI
  - Wpływ: Nie zakładać 1 wątek = 1 request
- Rabbit DirectMessageListenerContainer (spring.rabbitmq.listener.type=direct) wywołuje listener na wątku klienta amqp, zwykle 'pool-N-thread-M' (domyślna fabryka wątków klienta), a nie na 'RabbitListenerEndpointContainer#..'
  - Jak rozpoznać: Typ kontenera direct i nazwy pool-N-thread-M w liniach listenera
  - Wpływ: Klasyfikator po nazwie myli to z dowolnym Executors.newFixedThreadPool
- Spring bez Boota z @EnableScheduling bez własnego TaskScheduler używa Executors.newSingleThreadScheduledExecutor(): wątek 'pool-N-thread-1', a nie 'scheduling-1'
  - Jak rozpoznać: Brak Boota / brak beana TaskScheduler, @Scheduled w kodzie
  - Wpływ: Job wygląda jak anonimowa pula
- Quartz z SchedulerFactoryBean.setTaskExecutor(...) wykonuje joby na wątkach tego executora (np. 'task-N'), a nie na '_Worker-N'
  - Jak rozpoznać: setTaskExecutor w konfiguracji Quartz albo org.quartz.threadPool.class=LocalTaskExecutorThreadPool
  - Wpływ: Job Quartz myli się z @Async
- Undertow wbudowany w Boota nazywa wątki 'XNIO-1 task-N', a w WildFly 'default task-N'; tylko to drugie oznacza WildFly
  - Jak rozpoznać: Prefiks XNIO-<n>
  - Wpływ: Regex tylko na 'default task' gubi Boot+Undertow

**Asynchroniczne appendery: utrata zdarzeń, brak caller data, nazwa wątku z cache**

- Kolejność w pliku przy AsyncAppender to kolejność wstawienia do kolejki, więc przy kilku appenderach (sync konsola + async plik) linie mogą wyglądać na przestawione względem znaczników czasu
  - Jak rozpoznać: Znaczniki czasu nie rosną monotonicznie w pliku
  - Wpływ: Sortować po timestamp + numerze sekwencyjnym, nie po pozycji w pliku
- Log4j2 na starym JDK 8 (<8u102) z CACHED: po Thread.setName async logger wypisuje starą nazwę
  - Jak rozpoznać: java.version 1.8.0_<102 i AsyncLogger
  - Wpływ: Nazwa wątku w logu nie zgadza się z rzeczywistą
- Przy zatrzymaniu JVM AsyncAppender czeka na opróżnienie kolejki tylko maxFlushTime (domyślnie 1000 ms), a bez shutdown hooka nie czeka wcale
  - Jak rozpoznać: Ostatnie sekundy przed restartem/kill bez linii, mimo że request się wykonał
  - Wpływ: Końcówka przebiegu (commit, odpowiedź) znika

**Kierowanie NASZYCH logów diagnostycznych do osobnego pliku**

- Bez additivity=false nasze linie lądują też w root appenderach aplikacji i mieszają się z jej logiem
  - Jak rozpoznać: Logger 'flowlens.diag' widoczny w app.log
  - Wpływ: Zaśmiecenie logów klienta, możliwy podwójny odczyt
- Agent używający SLF4J z classpath aplikacji: w WildFly/EAR inny classloader, w aplikacji bez SLF4J brak klasy; konflikt wersji SLF4J 1.7 vs 2.0 ('No SLF4J providers were found' / 'Failed to load class org.slf4j.impl.StaticLoggerBinder')
  - Jak rozpoznać: NoClassDefFoundError / ostrzeżenia SLF4J przy starcie
  - Wpływ: Zdarzenia diagnostyczne giną po cichu (NOP logger)
- Kilka JVM/instancji (klaster, wiele podów na wspólnym wolumenie) pisze do jednego pliku
  - Jak rozpoznać: Przeplecione PID-y
  - Wpływ: Nazwa pliku z PID/hostname; Logback prudent=true jest wolny i nie obsługuje kompresji przy rotacji
- Appender dodany programowo przez agenta przed startem Boota znika, bo Boot resetuje LoggerContext przy inicjalizacji logowania (a Spring Cloud także przy odświeżeniu kontekstu)
  - Jak rozpoznać: Pierwsze linie diagnostyczne są, po 'Starting ...Application' już nie
  - Wpływ: Brak zdarzeń z całego czasu działania; stąd własny writer zamiast appendera

**Logi SQL i transakcji jako kroki przebiegu (Hibernate, JdbcTemplate, Spring TX, MyBatis, jOOQ)**

- spring.jpa.show-sql=true / hibernate.show_sql pisze System.out.println('Hibernate: '+sql) z pominięciem loggera: bez czasu, wątku i MDC
  - Jak rozpoznać: Linie 'Hibernate: select ...' bez prefiksu daty (przy hibernate.highlight_sql: '[Hibernate]' w kolorze ANSI)
  - Wpływ: Nie da się ich skorelować z requestem po wątku i czasie; zamiast nich włączyć logger org.hibernate.SQL
- logging.level.org.springframework.transaction=DEBUG obejmuje AbstractPlatformTransactionManager tylko pośrednio: logger to klasa managera, a JpaTransactionManager (org.springframework.orm.jpa), DataSourceTransactionManager (org.springframework.jdbc.datasource), JdbcTransactionManager (org.springframework.jdbc.support) i HibernateTransactionManager (org.springframework.orm.hibernate5) są poza tym pakietem. Obejmuje tylko JtaTransactionManager (org.springframework.transaction.jta) i TransactionInterceptor
  - Jak rozpoznać: Brak 'Creating new transaction' mimo DEBUG na org.springframework.transaction
  - Wpływ: Fałszywy wniosek 'brak transakcji'
- JdbcTemplate z własnym PreparedStatementCreator (nie SqlProvider) loguje 'Executing prepared SQL statement' bez SQL
  - Jak rozpoznać: Komunikat bez '[...]'
  - Wpływ: SQL trzeba wziąć z warstwy JDBC (agent/p6spy)
- Hibernate batching i flush przy commit: INSERT/UPDATE pojawia się po 'Initiating transaction commit', a nie w metodzie, która zmieniła encję
  - Jak rozpoznać: Seria UPDATE tuż po 'Initiating transaction commit'
  - Wpływ: Przypisać zapis do granicy transakcji, a nie do ostatniej metody w logu
- MyBatis z log-impl=STDOUT_LOGGING albo autodetekcją na JUL/commons-logging: inny format lub stdout
  - Jak rozpoznać: Linie '==>  Preparing:' bez prefiksu daty
  - Wpływ: Brak wątku do korelacji
- WildFly/JBoss przechwytuje System.out do loggera 'stdout' (INFO), więc 'Hibernate: ...' ma tam czas i wątek
  - Jak rozpoznać: 'INFO  [stdout] (default task-1) Hibernate: select ...' w server.log
  - Wpływ: Na WildFly show_sql DA SIĘ korelować po wątku, wbrew regule ogólnej
- Wewnętrzna transakcja REQUIRED rzuca wyjątek złapany w kodzie: 'Participating transaction failed - marking existing transaction as rollback-only', a zewnętrzny commit kończy się UnexpectedRollbackException
  - Jak rozpoznać: Ta linia, potem 'Initiating transaction commit' i 'Transaction rolled back because it has been marked as rollback-only'
  - Wpływ: Przebieg wygląda na udany aż do commitu; zapis znika na końcu

**Logi wejścia HTTP w Spring MVC: DispatcherServlet, 'Mapped to', CommonsRequestLoggingFilter (Spring 4.x i 5.1+)**

- Async servlet (DeferredResult, Callable, CompletableFuture w kontrolerze): 'Exiting but response remains open for further handling', dokończenie w innym wątku ('task-N' w Boot, 'MvcAsync1' w Spring bez executora), potem ponowny dispatch ASYNC na wątku kontenera z 'Completed'
  - Jak rozpoznać: 'Started async request' (WebAsyncManager) / 'Resume with async result [...]' (RequestMappingHandlerAdapter)
  - Wpływ: Request ma dwa lub trzy wątki; wiązać po URI + czasie albo naszym id
- Na TRACE 'Mapped to' wypisuje cały HandlerExecutionChain (z interceptorami), a filtry Spring Security logują przed DispatcherServletem
  - Jak rozpoznać: Logger org.springframework.security.web.FilterChainProxy 'Securing GET /orders/1'
  - Wpływ: Wejście zaczyna się wcześniej niż DispatcherServlet
- Stara aplikacja (Spring 4.x, Boot 1.x) ma zupełnie inne komunikaty, a regexy dla 5.1+ nie znajdują nic
  - Jak rozpoznać: 'processing GET request for [', 'Returning handler method [', 'Successfully completed request'
  - Wpływ: Fałszywy wniosek 'brak logów wejścia'; potrzebny drugi zestaw regexów
- Wyjątek, który wyszedł z DispatcherServleta, loguje kontener (Tomcat StandardWrapperValve) na loggerze 'org.apache.catalina.core.ContainerBase.[Tomcat].[localhost].[/].[dispatcherServlet]': 'Servlet.service() for servlet [dispatcherServlet] in context with path [] threw exception'; w samodzielnym Tomcacie trafia to do localhost.<data>.log, a nie do logu aplikacji
  - Jak rozpoznać: Ten komunikat w innym pliku niż reszta
  - Wpływ: Koniec przebiegu z błędem jest w innym źródle

**Access log Tomcata/Undertow/Quarkus jako kotwica requestu (%I wątek, %D czas, nagłówki id)**

- %I to wątek kończący request; przy async servlet / DeferredResult może to być inny wątek niż ten, który zaczynał
  - Jak rozpoznać: Linie aplikacji w oknie czasu na innym exec-N niż w access logu
  - Wpływ: Korelacja po %I gubi początek requestu
- Wpis jest zapisywany PO zakończeniu requestu, więc w pliku kolejność wg końca, a nie startu
  - Jak rozpoznać: Czas startu nie rośnie monotonicznie
  - Wpływ: Sortować po wyliczonym starcie
- Nagłówek X-Request-ID nadaje proxy/klient, a nie aplikacja; w wewnętrznych wywołaniach go nie ma ('-')
  - Jak rozpoznać: Wartość '-'
  - Wpływ: Nie zakładać obecności id
- %D zmienia jednostkę między Tomcat 9 (ms) a 10+ (µs)
  - Jak rozpoznać: Wersja Tomcata / Boot 2 vs 3; wartości ~1000 razy większe po migracji
  - Wpływ: Okno czasu źle policzone o 3 rzędy wielkości; używać %{ms}T
- W Boocie server.tomcat.accesslog.directory domyślnie 'logs' względem server.tomcat.basedir, a basedir domyślnie jest katalogiem tymczasowym
  - Jak rozpoznać: Brak pliku w katalogu aplikacji; plik w /tmp/tomcat.<port>.<id>/logs
  - Wpływ: Access log 'nie istnieje' albo znika po restarcie

**Java EE / Jakarta EE (WildFly, JBoss EAP): format JBoss LogManager, EJB, JTA, MDB**

- Aplikacja z własnym log4j.xml/logback w WAR i use-deployment-logging-config=true (domyślnie) loguje do własnego pliku, poza server.log
  - Jak rozpoznać: Pliki logu w katalogu aplikacji, a w server.log tylko logi serwera
  - Wpływ: Trzeba zebrać oba źródła i skleić po czasie i wątku (te same nazwy wątków)
- Przy @Asynchronous i MDB kontekst requestu jest tracony; MDB działa w transakcji kontenera, a commit następuje po onMessage
  - Jak rozpoznać: Wątek ActiveMQ-client-global-threads bez id
  - Wpływ: Wiązać producenta z konsumentem przez JMSMessageID (JMSCorrelationID to id odpowiedzi, nie trace), które musimy sami zalogować
- System.out/System.err aplikacji są przechwytywane przez JBoss LogManager jako logger 'stdout'/'stderr' (INFO/ERROR) z czasem i wątkiem
  - Jak rozpoznać: 'INFO  [stdout] (default task-3) ...' i 'ERROR [stderr] ... at com.x...' (stack trace z printStackTrace rozbity na osobne linie ERROR)
  - Wpływ: Linie stdout można korelować po wątku, ale każda linia stack trace to osobne zdarzenie
- JBoss AS 7 / EAP 6 (JBoss Web) nazywa wątki HTTP inaczej, np. 'http-/127.0.0.1:8080-1'
  - Jak rozpoznać: Wersja AS7/EAP6, brak 'default task-N'
  - Wpływ: Klasyfikator wątków dla WildFly nie rozpoznaje wejścia HTTP

**Quarkus i Micronaut: JBoss LogManager, Vert.x duplicated context, MdcPropagationContext**

- Na vert.x-eventloop-thread wiele requestów się przeplata, podobnie jak w WebFlux
  - Jak rozpoznać: Endpoint zwraca Uni/Multi albo jest @NonBlocking
  - Wpływ: Korelacja wątek+czas zawodzi
- Quarkus native image: brak agenta Java, więc wstrzyknięcie bytecode niemożliwe
  - Jak rozpoznać: Binarka bez JVM ('-runner'), quarkus.native.enabled=true (3.9+) albo quarkus.package.type=native (starsze)
  - Wpływ: Pozostają logi i statyczny graf
- Skrócone nazwy loggerów %c{3.} (Quarkus do 3.27) nie są inicjałami jak w Boocie, tylko 3-znakowymi prefiksami segmentów
  - Jak rozpoznać: '[com.acm.ord.OrderResource]'
  - Wpływ: Odtwarzanie FQCN z grafu kodu wymaga dopasowania prefiksów, a nie inicjałów
- Micronaut z logger.levels.* w application.yml resetuje Logback przy każdym refresh, więc appendery dodane programowo znikają
  - Jak rozpoznać: Właściwości logger.* w konfiguracji
  - Wpływ: Nasze zdarzenia przez appender giną po refreshu; użyć własnego writera

**Identyfikatory 'korelacji' w messagingu, które NIE są trace id (Axon traceId/correlationId, JMSCorrelationID, Spring Integration, Kafka headers)**

- Pomylenie Axon traceId z trace id OTel
  - Jak rozpoznać: Format UUID z myślnikami zamiast 32 hex
  - Wpływ: Błędne łączenie z logami HTTP
- Batch listener / tracking event processor Axona przetwarza wiele komunikatów naraz w jednym wątku i w jednej transakcji (batchSize)
  - Jak rozpoznać: Kilka zdarzeń w jednym wątku 'EventProcessor[...]-0' w milisekundach
  - Wpływ: Jeden SQL commit dla wielu wejść
- Axon LoggingInterceptor daje tylko nazwy typów, bez identyfikatorów i metadanych
  - Jak rozpoznać: 'Incoming message: [X]' bez id
  - Wpływ: Dwie komendy tego samego typu w tym samym czasie są nierozróżnialne

**JAX-WS/SOAP (Apache CXF LoggingFeature): ExchangeId w MDC tylko na czas jednej linii**

- MDC jest czyszczone zaraz po linii CXF, więc kod serwisu nie ma ExchangeId
  - Jak rozpoznać: ExchangeId tylko w liniach loggera org.apache.cxf.services.*
  - Wpływ: Kroki wewnętrzne wiązać po wątku między REQ_IN i RESP_OUT
- Ten sam port w kliencie (REQ_OUT/RESP_IN): aplikacja jest klientem innego serwisu SOAP
  - Jak rozpoznać: Typ REQ_OUT
  - Wpływ: To wyjście, a nie wejście
- CXF robi MDC.remove dla swoich kluczy bez przywrócenia poprzednich wartości: jeśli aplikacja ma w MDC własny klucz o tej samej nazwie (np. 'MessageId', 'Type', 'Address'), znika on po pierwszej linii CXF
  - Jak rozpoznać: Własny klucz MDC obecny przed REQ_IN, a pusty po nim w tym samym wątku
  - Wpływ: Korelacja aplikacji po tym kluczu urywa się w środku requestu

**Korelacja linii bez id (wątek + czas) i gdzie zawodzi; wiele instancji JVM**

- JUL SimpleFormatter i System.out (show-sql, e.printStackTrace, MyBatis STDOUT) nie mają nazwy wątku
  - Jak rozpoznać: Linie dwuwierszowe JUL ('Oct 21, 2026 10:00:00 AM com.x.Foo bar' + 'INFO: msg') albo bez prefiksu
  - Wpływ: Tylko korelacja po czasie, niepewna przy współbieżności
- stdout i plik logów są buforowane osobno: System.out w catalina.out przeplata się z logami w innej kolejności niż rzeczywista
  - Jak rozpoznać: Linie 'Hibernate:' przed linią wejścia, która je spowodowała
  - Wpływ: Nie używać pozycji w pliku jako porządku
- Batch Kafka listener / Spring Batch chunk: jeden wątek, jeden segment, wiele wejść biznesowych
  - Jak rozpoznać: List<ConsumerRecord> w sygnaturze @KafkaListener, batch=true; 'Executing step' w Spring Batch
  - Wpływ: Segment trzeba dzielić po rekordzie (nasze zdarzenia per rekord)
- Logi z kontenera (docker json-file, containerd/CRI) dzielą bardzo długie linie (ok. 16 KB) na kilka rekordów i dokładają własny znacznik czasu
  - Jak rozpoznać: Linia JSON urwana w środku; flaga partial / 'P' w formacie CRI
  - Wpływ: Parser JSON odrzuca linie albo tworzy fałszywe zdarzenia; trzeba sklejać częściowe rekordy

**Routing logów w legacy: JCL, Log4j 1.x, JUL, mosty SLF4J i pliki Tomcata (gdzie naprawdę trafia linia)**

- Brak bindingu SLF4J 1.7 (albo binding 1.7 przy API 2.x): wszystkie logi przez SLF4J idą do NOP i znikają, a zostają tylko logi JCL/JUL/System.out
  - Jak rozpoznać: Ostrzeżenie 'Failed to load class org.slf4j.impl.StaticLoggerBinder' albo 'No SLF4J providers were found' na starcie
  - Wpływ: Kroki aplikacji niewidoczne, choć kod loguje
- Podwójne logowanie: ta sama linia w dwóch plikach albo dwa razy w jednym (most + natywny appender, additivity=true na loggerze z własnym appenderem)
  - Jak rozpoznać: Identyczne linie z tym samym znacznikiem czasu
  - Wpływ: Fałszywe powtórzone kroki; deduplikować po (ts, wątek, logger, msg)
- Log4j 1 TTCC / %r: czas względny od startu JVM zamiast daty
  - Jak rozpoznać: Linia zaczyna się od liczby ('12345 [main] INFO ...')
  - Wpływ: Łączenie z innymi źródłami wymaga znajomości chwili startu JVM

**Wejścia batch i job w logach: Spring Batch, Quartz, Spring @Scheduled**

- Spring Batch z partycjonowaniem albo multi-threaded step wykonuje kroki na wątkach TaskExecutora, a nie na wątku joba
  - Jak rozpoznać: 'Executing step: [step1:partition0]' w różnych wątkach
  - Wpływ: Jeden job = wiele wątków; wiązać po nazwie kroku/partycji
- Logger launchera zmienia się między wersjami (SimpleJobLauncher w 4.x/5.x, TaskExecutorJobLauncher w 6)
  - Jak rozpoznać: Wersja spring-batch-core
  - Wpływ: Filtr po nazwie loggera gubi linie po migracji; filtrować po treści
- @Scheduled bez logów start/stop: wykonanie widać tylko pośrednio (wątek scheduling-N, SQL)
  - Jak rozpoznać: Linie na scheduling-N bez poprzedzającego wejścia
  - Wpływ: Granic wykonania nie da się wyznaczyć z samych logów

## Wstrzykiwanie

### Mechanizmy

| Nazwa | Jak rozpoznać statycznie | W logu | W OTel | Wstrzyknięcie |
|---|---|---|---|---|
| Pomocnik Diag: zapis JSONL do osobnego pliku (wspólny dla wszystkich punktów wstrzyknięcia) | Nie dotyczy (to nasz kod). W kopii repo pakiet com.flowlens.diag, żeby dało się go dodać do jboss.modules.system.pkgs albo org.osgi.framework.bootdelegation. | Własny plik: -Dflowlens.file=/tmp/flowlens-%pid.jsonl. Nie idzie przez logback, żeby nie zależeć od konfiguracji logowania aplikacji ani od jej asynchronicznych appenderów. | brak | Kod (Java 8, bez zależności):<br>public final class Diag {<br>  static final String PID = java.lang.management.ManagementFactory.getRuntimeMXBean().getName().split("@")[0];<br>  static final java.util.concurrent.atomic.AtomicLong SEQ = new java.util.concurrent.atomic.AtomicLong();<br>  static final ThreadLocal<String> KOR = new ThreadLocal<>();<br>  static final java.util.concurrent.locks.ReentrantLock L = new java.util.concurrent.locks.ReentrantLock();<br>  static final java.io.Writer OUT;<br>  static { try { String f = System.getProperty("flowlens.file", "/tmp/flowlens-%pid.jsonl").replace("%pid", PID);<br>    OUT = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(f, true), java.nio.charset.StandardCharsets.UTF_8));<br>  } catch (java.io.IOException e) { throw new ExceptionInInitializerError(e); } }<br>  public static String begin(String kor){ String k = kor != null ? kor : java.util.UUID.randomUUID().toString(); KOR.set(k); return k; }<br>  public static void end(){ KOR.remove(); }<br>  public static void ev(String ev, String klasa, String metoda, String extraJson){<br>    Thread t = Thread.currentThread();<br>    StringBuilder b = new StringBuilder(256).append("{\"ts\":").append(System.currentTimeMillis()).append(",\"ns\":").append(System.nanoTime())<br>      .append(",\"pid\":").append(q(PID)).append(",\"w\":").append(q(t.getName())).append(",\"tid\":").append(t.getId())<br>      .append(",\"kor\":").append(q(KOR.get())).append(",\"sek\":").append(SEQ.incrementAndGet())<br>      .append(",\"ev\":").append(q(ev)).append(",\"klasa\":").append(q(klasa)).append(",\"metoda\":").append(q(metoda));<br>    if (extraJson != null) b.append(',').append(extraJson);<br>    b.append("}\n");<br>    L.lock(); try { OUT.write(b.toString()); OUT.flush(); } catch (java.io.IOException ignored) {} finally { L.unlock(); }<br>  }<br>  public static String q(String s){ if (s == null) return "null"; StringBuilder b = new StringBuilder(s.length()+2).append('"');<br>    for (char c : s.toCharArray()) { if (c=='"'\|\|c=='\\') b.append('\\').append(c); else if (c<0x20) b.append(String.format("\\u%04x",(int)c)); else b.append(c); }<br>    return b.append('"').toString(); }<br>}<br>Zmiana względem wersji badacza: pid jest zapisywany jako string (q(PID)), bo RuntimeMXBean.getName() nie musi mieć postaci pid@host i wtedy JSON byłby niepoprawny.<br>Wywołania: Diag.ev("in", "HTTP", "GET /orders/{id}", "\"uri\":"+Diag.q(uri)); Diag.ev("sql", null, null, "\"sql\":"+Diag.q(sql)+",\"ms\":"+ms); Diag.ev("tx", null, "begin", "\"name\":"+Diag.q(name)). |
| Własny Java agent (java.lang.instrument + Byte Buddy Advice), bez zmian w kodzie | Nie wymaga zmian w kodzie. Wymaga dostępu do linii startu JVM: JAVA_TOOL_OPTIONS, JAVA_OPTS, standalone.conf, setenv.sh, ENTRYPOINT w Dockerfile. Manifest agenta: Premain-Class, Agent-Class, Can-Retransform-Classes: true, opcjonalnie Boot-Class-Path. | Byte Buddy: AgentBuilder.Listener.StreamWriting.toSystemError() wypisuje linie '[Byte Buddy] TRANSFORM <klasa> [<classloader>, <moduł>, loaded=false]' i '[Byte Buddy] ERROR <klasa> ...' ze stack trace. Przy ładowaniu dynamicznym JDK 21+ wypisuje 'WARNING: A Java agent has been loaded dynamically (...)' i podpowiedź -XX:+EnableDynamicAgentLoading. | brak (ten sam mechanizm co OTel javaagent, tylko bez OTel) | public static void premain(String a, Instrumentation inst){ new AgentBuilder.Default().ignore(nameStartsWith("net.bytebuddy.").or(nameContains("$$"))).type(nameStartsWith("com.firma.").and(not(isInterface()))).transform((b,td,cl,m,pd) -> b.visit(Advice.to(Trace.class).on(isMethod().and(not(isAbstract())).and(not(isSynthetic()))))).installOn(inst); }<br>class Trace { @Advice.OnMethodEnter static void in(@Advice.Origin("#t") String k, @Advice.Origin("#m") String m){ Diag.ev("in",k,m,null);} @Advice.OnMethodExit(onThrowable=Throwable.class) static void out(@Advice.Origin("#t") String k, @Advice.Origin("#m") String m, @Advice.Thrown Throwable t){ Diag.ev("out",k,m, t==null?null:"\"exc\":"+Diag.q(t.getClass().getName())); } }<br>Kod Advice jest wklejany do metod aplikacji, więc klasa Diag musi być widoczna z classloadera aplikacji i istnieć tylko w jednej kopii. |
| AspectJ load-time weaving (aspectjweaver jako javaagent + zewnętrzny aop.xml) | Istniejące META-INF/aop.xml w repo, @EnableLoadTimeWeaving, <context:load-time-weaver/>, spring-instrument.jar. Jeśli aplikacja już używa LTW, nasz aop.xml może kolidować z jej konfiguracją. | <weaver options="-verbose -showWeaveInfo -Xlint:ignore"> wypisuje linie w stylu '[AppClassLoader@...] weaveinfo Join point 'method-execution(...)' in Type 'com.firma.X' (X.java:12) advised by around advice from 'com.flowlens.DiagAspect''. | brak | Bez zmian w źródłach aplikacji: jar z abstrakcyjnym aspektem w stylu adnotacji @AspectJ (żeby nie wymagał ajc): @Aspect public abstract class AbstractDiag { @Pointcut public abstract void scope(); @Around("scope() && execution(* *(..))") public Object t(ProceedingJoinPoint p) throws Throwable { Diag.ev("in", ...); try { return p.proceed(); } finally { Diag.ev("out", ...); } } } oraz aop.xml: <aspectj><aspects><concrete-aspect name="com.flowlens.App" extends="com.flowlens.AbstractDiag"><pointcut name="scope" expression="within(com.firma..*)"/></concrete-aspect></aspects><weaver><include within="com.firma..*"/></weaver></aspectj>. |
| JFR Method Timing & Tracing (JEP 520), bez agenta i bez zmian w kodzie | Wersja JDK >= 25 (plik release w obrazie, java -version). | Plik .jfr. Odczyt: jfr print --events jdk.MethodTrace --stack-depth 20 rec.jfr albo jfr print --json --events jdk.MethodTrace rec.jfr (JSON gotowy do konwersji na JSONL). | brak | java '-XX:StartFlightRecording:filename=rec.jfr,method-trace=@org.springframework.web.bind.annotation.RestController;com.firma.OrderService' ... albo w działającej JVM: jcmd <pid> JFR.start method-trace=com.firma.OrderService::place filename=rec.jfr. Kilka filtrów rozdziela się średnikiem. Konwerter: z jdk.MethodTrace bierzemy eventThread, startTime, duration i method i wyliczamy in = startTime oraz out = startTime + duration. |
| Narzędzia attach bez restartu: Arthas trace/watch, Byteman rules, BTrace | Brak (narzędzie zewnętrzne). Trzeba sprawdzić, czy JVM nie ma -XX:+DisableAttachMechanism i czy kontener pozwala na attach (ten sam użytkownik, wspólny /tmp, przy różnych przestrzeniach nazw jattach). | Arthas: nagłówek '`---ts=2026-10-21 10:00:00;thread_name=http-nio-8080-exec-1;id=2a;is_daemon=true;priority=5;TCCL=...', a pod nim drzewo '`---[12.3ms] com.firma.OrderService:place()' i kolejne linie '+---[..]'. Byteman: -Dorg.jboss.byteman.verbose=true wypisuje komunikaty o wstrzykiwaniu i wykonaniu reguł (np. 'Rule.execute called for ...'; dokładny tekst zależy od wersji). | brak | Arthas: java -jar arthas-boot.jar <pid>, potem trace -E 'com\.firma\..*Service' '.*' '#cost>10' -n 50. Byteman: -javaagent:byteman.jar=script:/diag/flow.btm,boot:byteman.jar (na WildFly także -Djboss.modules.system.pkgs=org.jboss.byteman), reguła: RULE in CLASS ^com.firma.OrderService METHOD place AT ENTRY IF true DO com.flowlens.diag.Diag.ev("in","OrderService","place",null) ENDRULE. Znak ^ dopasowuje też podklasy. |
| Diagnostyka samą konfiguracją logowania Springa (MVC/WebFlux/tx/JDBC/Hibernate) | application.properties/yml, logback-spring.xml, log4j2.xml. Klucze logging.level.*, logging.pattern.console, logging.structured.format.* (Boot 3.4+), spring.mvc.log-request-details, spring.codec.log-request-details. | logging.level.org.springframework.web.servlet.DispatcherServlet=DEBUG (5.1+) daje 'GET "/orders/1", parameters={}' oraz 'Completed 200 OK'; TRACE dodaje szczegóły. logging.level.org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping=DEBUG (5.1+) daje 'Mapped to com.firma.OrderController#get(Long)'. logging.level.org.springframework.transaction.interceptor=TRACE daje 'Getting transaction for [com.firma.OrderService.find]' i 'Completing transaction for [...]'. logging.level.org.springframework.orm.jpa.JpaTransactionManager=DEBUG (albo DataSourceTransactionManager / org.springframework.transaction) daje 'Creating new transaction with name [com.firma.OrderService.find]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT', 'Participating in existing transaction', 'Suspending current transaction, creating new transaction with name [...]', 'Initiating transaction commit', 'Initiating transaction rollback', 'Resuming suspended transaction after completion of inner transaction'. logging.level.org.springframework.jdbc.core.JdbcTemplate=DEBUG daje 'Executing prepared SQL statement [select ...]'. logging.level.org.hibernate.SQL=DEBUG; parametry: Hibernate 6 org.hibernate.orm.jdbc.bind=TRACE, Hibernate 5 org.hibernate.type.descriptor.sql.BasicBinder=TRACE. WebFlux: org.springframework.web.server.adapter.HttpWebHandlerAdapter=DEBUG daje '[2a3f81c] HTTP GET "/orders/1"' (z Reactor Netty prefiks ma też numer żądania na połączeniu, np. [2a3f81c-1]). | brak | Bez zmian w kodzie: -Dlogging.level...=... albo zmienne środowiskowe LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_TRANSACTION_INTERCEPTOR=TRACE. Wzorzec: logging.pattern.console=%d{ISO8601} %pid [%thread] %X{traceId:-} %logger{0} %msg%n. Osobny plik: logback-spring.xml z appenderem FILE i additivity=false dla wymienionych loggerów. Logback od 1.3.8/1.4.8 ma JsonEncoder (ch.qos.logback.classic.encoder.JsonEncoder). Boot 3.4+ ma wbudowane logowanie strukturalne bez XML: logging.structured.format.file=ecs\|logstash\|gelf razem z logging.file.name, z nazwą wątku i MDC w każdej linii JSON. |
| Proxy JDBC: P6Spy i datasource-proxy (konfiguracja, bez zmian w kodzie) | spring.datasource.url / driver-class-name, persistence.xml <jta-data-source>, standalone.xml <datasource>, context.xml <Resource>, spy.properties, zależności p6spy / net.ttddyy:datasource-proxy / spring-boot-data-source-decorator. | P6Spy: logger 'p6spy' (appender=com.p6spy.engine.spy.appender.Slf4JLogger) albo plik spy.log. Format: logMessageFormat=com.p6spy.engine.spy.appender.CustomLineFormat, customLogMessageFormat=%(currentTime)\|%(executionTime)\|%(category)\|connection%(connectionId)\|%(sqlSingleLine). Kategorie: error, info, batch, debug, statement, commit, rollback, result, resultset; excludecategories=info,debug,result,resultset. datasource-proxy: logger net.ttddyy.dsproxy.listener.logging.SLF4JQueryLoggingListener, linia 'Name:ds, Connection:3, Time:1, Success:True, Type:Prepared, Batch:False, QuerySize:1, BatchSize:0, Query:["select ..."], Params:[(1)]'. Boot: decorator.datasource.datasource-proxy.logging=slf4j, decorator.datasource.datasource-proxy.query.enable-logging=true, decorator.datasource.datasource-proxy.query.log-level=debug (domyślnie), decorator.datasource.datasource-proxy.slow-query.threshold (w sekundach), decorator.datasource.p6spy.enable-logging=true, decorator.datasource.p6spy.logging=slf4j\|sysout\|file\|custom, decorator.datasource.p6spy.log-file=..., decorator.datasource.p6spy.log-format=... | brak | Bez kodu: spy.properties (driverlist=org.postgresql.Driver, appender=..., logfile=/tmp/spy.log, customLogMessageFormat jak wyżej). Ze zmianą (jar na classpath): własna implementacja com.p6spy.engine.spy.appender.MessageFormattingStrategy, która zwraca linię JSON z Diag (kor z ThreadLocal, w = nazwa wątku), ustawiona przez logMessageFormat=com.flowlens.P6Json. Albo datasource-proxy: ProxyDataSourceBuilder.create(ds).listener(new QueryExecutionListener(){ afterQuery(ExecutionInfo i, List<QueryInfo> q){ Diag.ev("sql",null,null,...); } }). |
| Hibernate StatementInspector (hook SQL na poziomie ORM) | spring.jpa.properties.hibernate.session_factory.statement_inspector, persistence.xml <property name="hibernate.session_factory.statement_inspector">, w Quarkus beany z @PersistenceUnitExtension, implementacje StatementInspector w kodzie. | Bez hooka: logger org.hibernate.SQL=DEBUG, org.hibernate.orm.jdbc.bind=TRACE (6+). Wolne zapytania: logger org.hibernate.SQL_SLOW (INFO, 'SlowQuery: N milliseconds...'), włączany w 5.4.5+ przez hibernate.session.events.log.LOG_QUERIES_SLOWER_THAN_MS, a w 6.x przez hibernate.log_slow_query=ms. Statystyki: hibernate.generate_statistics=true; podsumowanie 'Session Metrics {...}' loguje org.hibernate.engine.internal.StatisticalLoggingSessionEventListener na INFO (nie logger org.hibernate.stat). | brak | public class DiagInspector implements StatementInspector { public String inspect(String sql){ Diag.ev("sql", null, null, "\"src\":\"hibernate\",\"sql\":"+Diag.q(sql)); return sql; } }. Spring Boot bez zmian w źródłach: -Dspring.jpa.properties.hibernate.session_factory.statement_inspector=com.flowlens.DiagInspector oraz jar w loader.path (PropertiesLauncher). WildFly: właściwość w persistence.xml w kopii repo. |
| Doklejany jar z auto-konfiguracją Spring Boot (PropertiesLauncher loader.path), bez zmian w źródłach | Main-Class: org.springframework.boot.loader.launch.JarLauncher w MANIFEST.MF (sprawdzić, czy to JAR, bo WAR wymaga innego podejścia), Start-Class. W repo: spring.factories / AutoConfiguration.imports, @EnableAutoConfiguration(exclude=...), spring.autoconfigure.exclude. | --debug albo logging.level.org.springframework.boot.autoconfigure=DEBUG daje raport CONDITIONS EVALUATION REPORT z 'FlowLensAutoConfiguration matched'. Kolejność filtrów: logging.level.org.springframework.boot.web.servlet.ServletContextInitializerBeans=DEBUG daje 'Mapping filters: ...' (w Boot 4 pakiet może być inny po modularyzacji). | brak | @AutoConfiguration public class FlowLensAutoConfiguration { @Bean FilterRegistrationBean<Filter> flowLensFilter(){ FilterRegistrationBean<Filter> r = new FilterRegistrationBean<>(new DiagFilter()); r.setOrder(Ordered.HIGHEST_PRECEDENCE); r.setDispatcherTypes(DispatcherType.REQUEST); return r; } @Bean TransactionExecutionListener flowLensTx(){ return new TransactionExecutionListener(){ public void afterBegin(TransactionExecution t, Throwable f){ Diag.ev("tx",null,"begin","\"name\":"+Diag.q(t.getTransactionName())); } public void afterCommit(TransactionExecution t, Throwable f){ Diag.ev("tx",null,"commit",null);} public void afterRollback(TransactionExecution t, Throwable f){ Diag.ev("tx",null,"rollback",null);} }; } @Bean DiagAspect flowLensAspect(){ return new DiagAspect(); } } |
| Filtr wejścia: Servlet Filter / OncePerRequestFilter / HandlerInterceptor / WebFilter (zmiana w kopii repo) | web.xml <filter-class>, @WebFilter, extends OncePerRequestFilter / GenericFilterBean, implements WebFilter, HandlerInterceptor, WebMvcConfigurer#addInterceptors, <mvc:interceptors> w XML. | Bez własnego filtra częściowo zastępuje go CommonsRequestLoggingFilter (logger org.springframework.web.filter.CommonsRequestLoggingFilter=DEBUG, 'Before request [GET /orders/1]' / 'After request [...]'), który trzeba zarejestrować jako bean. | Odpowiednik w auto-instrumentacji to span SERVER 'GET /orders/{id}' z http.route. Tu brak. | public class DiagFilter extends OncePerRequestFilter { protected void doFilterInternal(HttpServletRequest rq, HttpServletResponse rs, FilterChain ch) throws IOException, ServletException { Diag.begin(rq.getHeader("X-Request-Id")); Diag.ev("in","HTTP",rq.getMethod()+" "+rq.getRequestURI(),null); try { ch.doFilter(rq,rs); } finally { Object h = rq.getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE); Diag.ev("out", h instanceof HandlerMethod ? ((HandlerMethod)h).getBeanType().getName() : "HTTP", h instanceof HandlerMethod ? ((HandlerMethod)h).getMethod().getName() : rq.getRequestURI(), "\"status\":"+rs.getStatus()); Diag.end(); } } }. WebFlux: chain.filter(ex).contextWrite(Context.of("kor", kor)).doFinally(s -> Diag.ev("out",...)). |
| Aspekt Spring AOP na klasach (@Aspect / XML <aop:config>, zmiana w kopii repo) | @EnableAspectJAutoProxy, <aop:aspectj-autoproxy/>, spring-boot-starter-aop (Boot 2/3; w Boot 4 przemianowany na spring-boot-starter-aspectj), aspectjweaver w zależnościach, istniejące @Aspect, proxyTargetClass, spring.aop.proxy-target-class, spring.aop.auto. | Brak gotowego. Pomocniczo: logging.level.org.springframework.aop=DEBUG pokazuje tworzenie proxy, a CustomizableTraceInterceptor / SimpleTraceInterceptor (org.springframework.aop.interceptor) na TRACE loguje 'Entering method '...' of class [...]' / 'Exiting method '...'' loggerem klasy celu (setUseDynamicLogger(true)). | brak (OTel @WithSpan działa podobnie, przez agenta) | @Aspect @Order(Ordered.HIGHEST_PRECEDENCE) public class DiagAspect { @Around("within(@org.springframework.stereotype.Service *) \|\| within(@org.springframework.stereotype.Controller *) \|\| within(@org.springframework.web.bind.annotation.RestController *) \|\| execution(* org.springframework.data.repository.Repository+.*(..))") public Object t(ProceedingJoinPoint p) throws Throwable { String k = AopUtils.getTargetClass(p.getTarget()).getName(), m = p.getSignature().getName(); Diag.ev("in",k,m,null); String exc = null; try { return p.proceed(); } catch (Throwable e) { exc = "\"exc\":"+Diag.q(e.getClass().getName()); throw e; } finally { Diag.ev("out",k,m,exc); } } }. Jedno out na wywołanie (wersja badacza emitowała out dwa razy przy wyjątku). |
| Hooki transakcji: TransactionExecutionListener (Spring 6.1+), TransactionSynchronization, JTA TransactionSynchronizationRegistry | @Transactional (spring vs jakarta.transaction), @TransactionAttribute (EJB), TransactionTemplate, <tx:advice>, <tx:annotation-driven>, @EnableTransactionManagement, persistence.xml transaction-type=JTA. | Spring: patrz wpis o logach (AbstractPlatformTransactionManager). WildFly/Narayana: logger com.arjuna=TRACE (m.in. 'BasicAction::Begin() for action-id ...'; dokładne teksty zależą od wersji Narayany). Quarkus: quarkus.log.category."com.arjuna".level=TRACE (wymaga też quarkus.log.min-level=TRACE). | brak (auto-instrumentacja OTel nie tworzy spanów transakcji Springa, widać tylko JDBC) | Spring 6.1: bean TransactionExecutionListener z wpisu o auto-konfiguracji. Spring <6.1: BeanPostProcessor owijający PlatformTransactionManager w delegata, który loguje getTransaction(def) z def.getName(), def.getPropagationBehavior() i status.isNewTransaction() oraz commit/rollback (ten wariant widzi też uczestnictwo). JTA (kopia repo, interceptor CDI/EJB): @Resource TransactionSynchronizationRegistry r; Object key = r.getTransactionKey(); if (key != null) { Diag.ev("tx",null,"join","\"txkey\":"+Diag.q(key.toString())); r.registerInterposedSynchronization(new Synchronization(){ public void beforeCompletion(){} public void afterCompletion(int s){ Diag.ev("tx",null, s==Status.STATUS_COMMITTED?"commit":"rollback", null); } }); } |
| Hooki SQL w bibliotekach niebędących JPA: MyBatis Interceptor, jOOQ ExecuteListener, Querydsl SQLListener, JdbcTemplate | mybatis-config.xml <plugins><plugin interceptor=...>, @Mapper, *Mapper.xml, mybatis.configuration.* w Boot; DSLContext, DefaultConfiguration, spring.jooq.sql-dialect; SQLQueryFactory, com.querydsl.sql.Configuration. | MyBatis: logger per id statementu mappera, np. logging.level.com.firma.mapper.OrderMapper=DEBUG daje '==>  Preparing: select ... where id = ?', '==> Parameters: 1(Long)', '<==      Total: 1' (TRACE dodaje wiersze). Ustawienia logImpl=SLF4J, logPrefix. jOOQ: logger org.jooq.tools.LoggerListener=DEBUG (przy Settings.executeLogging=true, domyślnie) daje 'Executing query : select ...', '-> with bind values : ...', 'Fetched result', 'Affected row(s) : 1'. | brak | MyBatis: public Object intercept(Invocation inv) throws Throwable { MappedStatement ms = (MappedStatement) inv.getArgs()[0]; String id = ms.getId(); int dot = id.lastIndexOf('.'); long t0 = System.nanoTime(); try { return inv.proceed(); } finally { Diag.ev("sql", id.substring(0,dot), id.substring(dot+1), "\"sql\":"+Diag.q(ms.getBoundSql(inv.getArgs()[1]).getSql())+",\"ms\":"+(System.nanoTime()-t0)/1000000); } }. W Boot z mybatis-spring-boot-starter wystarczy bean Interceptor (MybatisAutoConfiguration zbiera beany Interceptor). jOOQ w Boot: bean DefaultExecuteListenerProvider(new DiagListener()), bo JooqAutoConfiguration zbiera wszystkie ExecuteListenerProvider w kolejności. Bez Boota: configuration.set(new DefaultExecuteListenerProvider(...)). |
| Jakarta EE / Java EE: interceptory CDI/EJB, filtry JAX-RS, handlery JAX-WS, MDB | @Stateless/@Stateful/@Singleton/@MessageDriven, ejb-jar.xml, beans.xml (bean-discovery-mode), @Interceptors, @AroundInvoke, @Path, @Provider, Application#getClasses, web.xml (resteasy.providers, jersey.config.server.provider.classnames), @WebService, @HandlerChain, sun-jaxws.xml, cxf-servlet.xml <jaxws:endpoint><jaxws:features>. | CXF 3.1+ LoggingFeature (Slf4jEventSender) loguje loggerem 'org.apache.cxf.services.<PortTypeName>.<typ zdarzenia>', np. ...OrderPortType.REQ_IN / RESP_OUT, z ExchangeId do korelacji. Metro: -Dcom.sun.xml.ws.transport.http.HttpAdapter.dump=true (serwer), -Dcom.sun.xml.ws.transport.http.client.HttpTransportPipe.dump=true (klient). WildFly: logger org.jboss.as.ejb3.invocation loguje nieudane wywołania EJB (WFLYEJB0034 'EJB Invocation failed on component ...'), a nie każde wywołanie. | brak | @Interceptor @Priority(Interceptor.Priority.PLATFORM_BEFORE) @Diagnosed public class DiagInterceptor { @AroundInvoke public Object t(InvocationContext c) throws Exception { String k = c.getTarget().getClass().getName(), m = c.getMethod().getName(); Diag.ev("in",k,m,null); try { return c.proceed(); } finally { Diag.ev("out",k,m,null); } } }. Ta sama klasa (bez @Interceptor) jako domyślny interceptor EJB w ejb-jar.xml. JAX-RS: @Provider public class DiagRs implements ContainerRequestFilter, ContainerResponseFilter { @Context ResourceInfo ri; ... Diag.begin(req.getHeaderString("X-Request-Id")); Diag.ev("in", ri.getResourceClass().getName(), ri.getResourceMethod().getName(), null); }. ResourceInfo jest dostępne tylko w filtrze post-matching (bez @PreMatching). |
| Wejścia z komunikatów: Kafka, RabbitMQ, JMS (Spring), Spring Integration | @KafkaListener, @RabbitListener, @JmsListener, @StreamListener (Spring Cloud Stream do 3.x) albo funkcyjne beany Consumer<...> i spring.cloud.function.definition, @ServiceActivator, IntegrationFlow, <int:channel> w XML, @MessageDriven. | spring-kafka: logging.level.org.springframework.kafka.listener=DEBUG (KafkaMessageListenerContainer: 'Received: N records'); na TRACE 'Processing ...' z opisem rekordu, który w nowszych wersjach domyślnie zawiera tylko metadane (topic-partycja@offset), a w starszych pełne 'ConsumerRecord(topic = ..., partition = ..., offset = ...)'. Rabbit: org.springframework.amqp.rabbit.listener=DEBUG. Spring Integration: logging.level.org.springframework.integration=DEBUG ('preSend on channel '...', message: GenericMessage [...]'), o ile kanał ma włączone logowanie (loggingEnabled, domyślnie true). | brak (w OTel byłby span CONSUMER '<topic> process') | Kafka (bean, Boot podpina go, gdy jest jedyny): @Bean RecordInterceptor<Object,Object> diagRi(){ return new RecordInterceptor<>(){ public ConsumerRecord<Object,Object> intercept(ConsumerRecord<Object,Object> r, Consumer<Object,Object> c){ Header h = r.headers().lastHeader("X-Correlation-Id"); Diag.begin(h==null?null:new String(h.value(), StandardCharsets.UTF_8)); Diag.ev("in","KAFKA",r.topic(),"\"partition\":"+r.partition()+",\"offset\":"+r.offset()); return r; } public void afterRecord(ConsumerRecord<Object,Object> r, Consumer<Object,Object> c){ Diag.ev("out","KAFKA",r.topic(),null); Diag.end(); } }; }. Spring Integration: @Bean @GlobalChannelInterceptor(patterns="*") ChannelInterceptor diagCi(){ return new ChannelInterceptor(){ public Message<?> preSend(Message<?> m, MessageChannel ch){ Diag.ev("log","channel",ch.toString(),null); return m; } }; }. |
| Wejścia z harmonogramów: Quartz listeners (konfiguracja), @Scheduled, @Async i TaskDecorator | @Scheduled(cron/fixedRate/fixedDelay), @EnableScheduling, <task:scheduled-tasks> w XML, implements Job / QuartzJobBean, quartz.properties, spring.quartz.*, @Async, ThreadPoolTaskExecutor, @Schedule (EJB). | Quartz: LoggingJobHistoryPlugin loguje na INFO (logger org.quartz.plugins.history.LoggingJobHistoryPlugin) 'Job DEFAULT.myJob fired (by trigger DEFAULT.myTrigger) at: ...' i 'Job DEFAULT.myJob execution complete at ... and reports: null'. Spring: logging.level.org.springframework.scheduling=DEBUG/TRACE. Spring 6.1+ ma obserwację 'tasks.scheduled.execution' (ScheduledTaskObservationDocumentation), ale bez ObservationRegistry nic nie loguje. | brak | public class DiagJobListener implements JobListener { public String getName(){ return "DIAG"; } public void jobToBeExecuted(JobExecutionContext c){ Diag.begin(c.getFireInstanceId()); Diag.ev("in", c.getJobDetail().getJobClass().getName(), "execute", "\"trigger\":"+Diag.q(c.getTrigger().getKey().toString())); } public void jobExecutionVetoed(JobExecutionContext c){} public void jobWasExecuted(JobExecutionContext c, JobExecutionException e){ Diag.ev("out", c.getJobDetail().getJobClass().getName(), "execute", e==null?null:"\"exc\":"+Diag.q(e.getMessage())); Diag.end(); } }. TaskDecorator: r -> { String k = Diag.KOR.get(); return () -> { Diag.KOR.set(k); try { r.run(); } finally { Diag.end(); } }; }. W Boot bean TaskDecorator jest podpinany do auto-konfigurowanego executora; własny ThreadPoolTaskExecutor wymaga setTaskDecorator. |
| Axon Framework: MessageHandlerInterceptor / MessageDispatchInterceptor i CorrelationDataProvider | @CommandHandler, @EventHandler, @EventSourcingHandler, @QueryHandler, @Aggregate, @Saga, @ProcessingGroup, CommandGateway.send/sendAndWait, axon.* w application.yml. | Wbudowany org.axonframework.messaging.interceptors.LoggingInterceptor, który trzeba zarejestrować. Loguje na INFO 'Incoming message: [CreateOrderCommand]' i '[CreateOrderCommand] executed successfully with a [...] return value', a przy błędzie na WARN '[...] execution failed:'. Jako dispatch interceptor loguje 'Dispatched messages: [...]'. Logger to LoggingInterceptor albo nazwa podana w konstruktorze. Procesory: logging.level.org.axonframework.eventhandling=DEBUG. | brak (Axon ma własne moduły tracingu; bez nich nic) | Spring Boot (Axon 4): @Autowired void reg(CommandBus bus){ bus.registerHandlerInterceptor((uow, chain) -> { Message<?> m = uow.getMessage(); Diag.begin((String) m.getMetaData().getOrDefault("correlationId", m.getIdentifier())); Diag.ev("in","AXON-CMD",m.getPayloadType().getName(),null); uow.afterCommit(u -> Diag.ev("tx",null,"uow-commit",null)); uow.onRollback(u -> Diag.ev("tx",null,"uow-rollback",null)); try { return chain.proceed(); } finally { Diag.ev("out","AXON-CMD",m.getPayloadType().getName(),null); } }); } oraz @Autowired void cfg(EventProcessingConfigurer c){ c.registerDefaultHandlerInterceptor((conf, name) -> diagEventInterceptor); } |
| Micronaut i Quarkus: interceptory compile/build-time, filtry, konfiguracja logów | micronaut-inject-java w annotationProcessorPaths, @Controller (io.micronaut.http.annotation), @Singleton, application.yml micronaut.*; Quarkus: quarkus-* w pom, application.properties quarkus.*, @ApplicationScoped, @Path. | Quarkus: quarkus.http.access-log.enabled=true, quarkus.http.access-log.pattern='%h %t "%r" %s %D %{i,X-Request-Id} %I' (%I to nazwa wątku), quarkus.hibernate-orm.log.sql=true, parametry przez quarkus.log.category."org.hibernate.orm.jdbc.bind".level=TRACE (starsze: quarkus.hibernate-orm.log.bind-parameters), quarkus.log.category."org.hibernate.SQL".level=DEBUG, JSON przez quarkus-logging-json (klucze quarkus.log.file.json.*, nazwy zależne od wersji). Micronaut: logger io.micronaut.http.server=TRACE, io.micronaut.data.query=DEBUG (Micronaut Data: 'Executing Query: SELECT ...'), io.micronaut.transaction=DEBUG / io.micronaut.data.connection=DEBUG. | brak | Micronaut 4: @ServerFilter("/**") class DiagF { @RequestFilter void in(HttpRequest<?> r){ Diag.begin(r.getHeaders().get("X-Request-Id")); Diag.ev("in","HTTP",r.getMethodName()+" "+r.getPath(),null);} @ResponseFilter void out(HttpResponse<?> s){ Diag.ev("out","HTTP",null,"\"status\":"+s.code()); Diag.end(); } }. Quarkus: @Diagnosed @Interceptor @Priority(Interceptor.Priority.PLATFORM_BEFORE) z @AroundInvoke jak w Jakarta EE plus @ServerRequestFilter. Javaagent działa w trybie JVM (java -javaagent ... -jar quarkus-run.jar), nie w native. |
| Legacy: Spring 3/4 XML i Struts 1/2, wstrzyknięcie przez deskryptory XML | applicationContext*.xml, *-servlet.xml, <bean class=...>, <tx:advice>, <aop:config>; struts.xml / struts-config.xml, extends ActionSupport / extends Action (org.apache.struts.action.Action), *.do / *.action w web.xml. | Struts 2: <constant name="struts.devMode" value="true"/> plus logger com.opensymphony.xwork2=DEBUG (DefaultActionInvocation: 'Executing action method = list'). Timer interceptor (<interceptor-ref name="timer"/>) loguje 'Executed action [/orders!list] took 15 ms.' loggerem com.opensymphony.xwork2.interceptor.TimerInterceptor. Struts 1: logger org.apache.struts.action.RequestProcessor=DEBUG ('Processing a 'GET' for path '/orders''). | brak (OTel ma instrumentację struts-2.3 i spring-webmvc-3.1, ale tu bez OTel) | Spring XML (bez zmian w .java): <bean id="diag" class="com.flowlens.DiagMethodInterceptor"/><aop:config proxy-target-class="true"><aop:advisor advice-ref="diag" pointcut="execution(* com.firma..service..*(..)) or execution(* com.firma..dao..*(..))" order="1"/></aop:config>. Struts 2: public class DiagInterceptor extends AbstractInterceptor { public String intercept(ActionInvocation i) throws Exception { String k = i.getAction().getClass().getName(), m = i.getProxy().getMethod(); Diag.ev("in",k,m,null); try { return i.invoke(); } finally { Diag.ev("out",k,m,"\"result\":"+Diag.q(i.getResultCode())); } } } |
| Kontener servletów: Tomcat AccessLogValve / Undertow / Jetty RequestLog (konfiguracja, granice requestu z wątkiem) | server.xml <Valve className="org.apache.catalina.valves.AccessLogValve">, application.properties server.tomcat.accesslog.*, server.undertow.accesslog.*, server.jetty.accesslog.*, standalone.xml <access-log> w subsystemie undertow. | Spring Boot 3 (Tomcat 10.1): server.tomcat.accesslog.enabled=true, server.tomcat.accesslog.directory=/tmp, server.tomcat.accesslog.buffered=false, server.tomcat.accesslog.pattern=%{end:yyyy-MM-dd'T'HH:mm:ss.SSS}t %I %{X-Request-Id}i "%r" %s %{ms}T. Przykładowa linia: '2026-10-21T10:00:00.123 http-nio-8080-exec-3 - "GET /orders/1 HTTP/1.1" 200 42'. Uwaga: w Tomcat 10.1+ %D to mikrosekundy (w Tomcat 9 i starszych milisekundy). Undertow: %I albo %{THREAD_NAME} to nazwa wątku (ThreadNameAttribute). Tomcat 10.1/11 ma też JsonAccessLogValve (jeden obiekt JSON na linię). | brak | Bez zmian w kodzie: właściwości Boota albo Valve w server.xml / konfiguracji kontenera. Konwerter: linia access logu -> {ev:"out", w: %I, ts: czas zakończenia, ms: czas trwania} oraz wyliczone in = ts - ms. W Tomcacie %{format}t bez prefiksu oznacza czas zakończenia odpowiedzi, a prefiks begin: daje czas startu, więc można zalogować oba. |
| Micrometer Observation: jeden bean ObservationHandler zbiera HTTP, @Scheduled, Kafka/Rabbit, klientów HTTP i JDBC (Spring 6 / Boot 3+) | spring-boot-starter-actuator (w Boot 3 auto-konfiguracja obserwacji jest w actuatorze), micrometer-observation, management.observations.*, @Observed (wymaga beana ObservedAspect), spring.kafka.listener.observation-enabled, spring.rabbitmq.listener.simple.observation-enabled, net.ttddyy.observation:datasource-micrometer-spring-boot. | Brak domyślnego logowania. Pomocniczo: ObservationTextPublisher (io.micrometer.observation.ObservationTextPublisher) zarejestrowany jako handler wypisuje START/STOP z nazwą i tagami. logging.level.io.micrometer.observation=DEBUG pokazuje rejestrację. | brak (z micrometer-tracing-bridge-otel te same obserwacje stają się spanami OTel, np. span 'http get /orders/{id}') | @Bean ObservationHandler<Observation.Context> flowLensObs(){ return new ObservationHandler<>(){ public boolean supportsContext(Observation.Context c){ return true; } public void onStart(Observation.Context c){ Diag.ev("in","OBS",c.getName(),"\"tags\":"+Diag.q(String.valueOf(c.getLowCardinalityKeyValues()))); } public void onError(Observation.Context c){ } public void onStop(Observation.Context c){ Diag.ev("out","OBS",c.getName(),"\"tags\":"+Diag.q(String.valueOf(c.getLowCardinalityKeyValues()))+(c.getError()==null?"":",\"exc\":"+Diag.q(c.getError().getClass().getName()))); } }; }. Kor: w onStart dla kontekstu ServerRequestObservationContext wziąć nagłówek X-Request-Id z carrier i wywołać Diag.begin, w onStop Diag.end. |
| Proxy R2DBC (r2dbc-proxy) i logi Spring R2DBC dla stosów reaktywnych | spring.r2dbc.url, ConnectionFactory @Bean, io.r2dbc:r2dbc-* w zależnościach, ReactiveCrudRepository, DatabaseClient, R2dbcEntityTemplate. | logging.level.org.springframework.r2dbc.core=DEBUG (DefaultDatabaseClient: 'Executing SQL statement [select ...]'), logging.level.org.springframework.r2dbc.connection.R2dbcTransactionManager=DEBUG (komunikaty tx jak w AbstractReactiveTransactionManager), sterownik PostgreSQL: io.r2dbc.postgresql.QUERY=DEBUG (do sprawdzenia dla wersji sterownika). | brak | public class DiagR2dbcListener implements ProxyExecutionListener { public void afterQuery(QueryExecutionInfo i){ Diag.ev("sql", null, null, "\"sql\":"+Diag.q(i.getQueries().get(0).getQuery())+",\"ms\":"+i.getExecuteDuration().toMillis()+",\"w\":"+Diag.q(i.getThreadName())); } }. Klasa na classpath i parametr proxyListener w URL. |
| Wyjścia HTTP: ClientHttpRequestInterceptor / RestClient / ExchangeFilterFunction / Feign / JAX-RS ClientRequestFilter | RestTemplate, RestTemplateBuilder, RestClient, WebClient, @FeignClient, feign.Client, jakarta.ws.rs.client.ClientBuilder, HttpClients.custom(), java.net.http.HttpClient. | logging.level.org.springframework.web.client.RestTemplate=DEBUG ('HTTP GET http://...', 'Response 200 OK'). Apache HttpClient 4: org.apache.http.headers / org.apache.http.wire=DEBUG; HttpClient 5: org.apache.hc.client5.http.headers / .wire. JDK HttpClient: -Djdk.httpclient.HttpClient.log=requests,headers. Feign: Logger.Level.FULL (feign.client.config.default.loggerLevel=full) i logging.level.<interfejs @FeignClient>=DEBUG. | brak (w OTel span CLIENT 'GET' z server.address) | @Bean RestTemplateCustomizer diagRt(){ return rt -> rt.getInterceptors().add(0, (rq, body, ex) -> { rq.getHeaders().set("X-Request-Id", Diag.KOR.get()); Diag.ev("call","HTTP-OUT",rq.getMethod()+" "+rq.getURI(),null); long t0=System.nanoTime(); ClientHttpResponse r = ex.execute(rq, body); Diag.ev("ret","HTTP-OUT",rq.getMethod()+" "+rq.getURI(),"\"status\":"+r.getStatusCode().value()+",\"ms\":"+(System.nanoTime()-t0)/1000000); return r; }); }. Analogicznie RestClientCustomizer i WebClientCustomizer. |

### Wyjątki i ich wpływ na przebieg

**Pomocnik Diag: zapis JSONL do osobnego pliku (wspólny dla wszystkich punktów wstrzyknięcia)**

- Wirtualne wątki (JDK 21+) mają domyślnie pustą nazwę (getName() zwraca ""). getId() jest deprecated od JDK 19, zastępuje go threadId().
  - Jak rozpoznać: Executors.newVirtualThreadPerTaskExecutor, spring.threads.virtual.enabled=true (Boot 3.2+), puste w w logach
  - Wpływ: Grupowanie po w skleja różne requesty. Trzeba grupować po tid/kor, a nie po nazwie wątku.
- Blok synchronized przypina wirtualny wątek do nośnika aż do JDK 24 (JEP 491). Dlatego ReentrantLock zamiast synchronized.
  - Jak rozpoznać: Ostrzeżenia -Djdk.tracePinnedThreads (JDK 21-23)
  - Wpływ: Same zdarzenia się nie zmieniają, ale rośnie latencja i zmierzone czasy przestają być wiarygodne.
- Kilka JVM (klaster, kilka instancji w kontenerze) piszących do jednego pliku miesza linie. Dlatego %pid w nazwie pliku. W kontenerach pid to często 1, więc warto dodać hostname.
  - Jak rozpoznać: Kilka procesów z tym samym -Dflowlens.file
  - Wpływ: Uszkodzone linie JSON, sek bez sensu między procesami.
- ThreadLocal nie przechodzi przez @Async, CompletableFuture, Reactor ani pule wątków. Bez propagacji kor zdarzenia z innego wątku zostają osierocone.
  - Jak rozpoznać: Linie z kor=null w trakcie trwania requestu
  - Wpływ: Przebieg się urywa. Trzeba TaskDecorator albo context-propagation (osobne wpisy).
- Wyciek ThreadLocal w puli wątków serwera, gdy end() nie jest w finally.
  - Jak rozpoznać: Ten sam kor w kolejnych, niezwiązanych requestach na tym samym wątku
  - Wpływ: Dwa requesty sklejają się w jeden przebieg.
- Klasa Diag załadowana dwa razy przez różne classloadery, np. raz z jara agenta (system/boot CL), a raz z WEB-INF/lib albo z jara doklejonego przez loader.path. Każda kopia ma własny KOR, SEQ i Writer.
  - Jak rozpoznać: Ten sam plik otwierany przez kilka kopii; kor ustawiony w filtrze (kopia z aplikacji) niewidoczny w zdarzeniach z agenta (kopia systemowa); powtarzające się wartości sek
  - Wpływ: Zdarzenia z agenta mają kor=null, sek się dubluje, a linie mogą się przeplatać (dwa niezależne locki). Diag ma być w jednym miejscu: bootstrap/system CL widoczny dla aplikacji, a nie spakowany w aplikacji.
- RuntimeMXBean.getName() zwraca format zależny od implementacji (zwykle pid@host, ale specyfikacja tego nie gwarantuje).
  - Jak rozpoznać: Nietypowa JVM (np. starsze IBM J9) albo nazwa bez @
  - Wpływ: Gdy pid jest wypisywany bez cudzysłowów, linia przestaje być poprawnym JSON. Na Java 9+ pewniejsze jest ProcessHandle.current().pid().

**Własny Java agent (java.lang.instrument + Byte Buddy Advice), bez zmian w kodzie**

- Izolacja classloaderów w WildFly/JBoss EAP (JBoss Modules) i OSGi. Wklejony kod odwołuje się do Diag, a moduł aplikacji tej klasy nie widzi. W JBoss Modules samo inst.appendToBootstrapClassLoaderSearch(jar) nie wystarcza, bo moduły widzą z zewnątrz tylko pakiety z listy systemowej.
  - Jak rozpoznać: NoClassDefFoundError: com/flowlens/diag/Diag w instrumentowanej klasie; serwer JBoss/WildFly/Karaf
  - Wpływ: Instrumentowane metody rzucają błąd i aplikacja przestaje działać. Rozwiązanie: -Djboss.modules.system.pkgs=com.flowlens.diag (w standalone.conf przez JBOSS_MODULES_SYSTEM_PKGS), a w OSGi org.osgi.framework.bootdelegation=com.flowlens.diag razem z umieszczeniem jara w boot classpath.
- WebLogic i WebSphere: delegacja classloaderów bywa ustawiona na parent-last (prefer-application-packages w weblogic.xml, PARENT_LAST w WebSphere). Liberty jest zbudowany na OSGi.
  - Jak rozpoznać: weblogic.xml <prefer-application-packages>/<prefer-web-inf-classes>, ustawienie classloader mode w WebSphere, server.xml Liberty
  - Wpływ: Może pojawić się druga kopia Diag albo NoClassDefFoundError. Na Liberty trzeba ustawić bootdelegation w jvm.options/bootstrap.properties (do sprawdzenia na konkretnej wersji).
- Byte Buddy (przez ASM) nie zna wersji class file aplikacji.
  - Jak rozpoznać: Komunikat Byte Buddy: 'Java 25 (69) is not supported by the current version of Byte Buddy which officially supports Java 24 (68) - update Byte Buddy or set net.bytebuddy.experimental as a VM property', albo z ASM: 'Unsupported class file major version 69' w [Byte Buddy] ERROR
  - Wpływ: Klasy po cichu zostają bez instrumentacji i przebieg ma dziury. Java 24 nieeksperymentalnie od 1.15.4, Java 25 od 1.17.5 (ASM 9.8), Java 26 od 1.17.8 (ASM 9.9). Awaryjnie -Dnet.bytebuddy.experimental=true.
- Proxy Springa (CGLIB: Foo$$SpringCGLIB$$0 w Spring 6, Foo$$EnhancerBySpringCGLIB$$<hash> w Spring 5) i proxy Hibernate (Foo$HibernateProxy$<losowe>) to podklasy z tym samym prefiksem nazwy, więc pasują do nameStartsWith("com.firma.").
  - Jak rozpoznać: Nazwy klas z $$ albo $HibernateProxy$ w zdarzeniach
  - Wpływ: Podwojone zdarzenia in/out. Trzeba wykluczyć nameContains("$$"), nameContains("$HibernateProxy$") i isSynthetic().
- Dynamiczne podłączanie do działającej JVM (attach API) w JDK 21+ wypisuje ostrzeżenie (JEP 451), a w przyszłości będzie domyślnie zablokowane. Retransformacja już załadowanych klas nie może dodawać pól ani metod.
  - Jak rozpoznać: Agent-Class i VirtualMachine.attach zamiast -javaagent
  - Wpływ: Advice musi być czysto inline (bez nowych pól). Trzeba -XX:+EnableDynamicAgentLoading, a w AgentBuilder RedefinitionStrategy.RETRANSFORMATION.
- GraalVM native image (Quarkus/Micronaut/Spring native) nie obsługuje -javaagent w czasie działania.
  - Jak rozpoznać: Plik wykonywalny bez java na starcie; native-image w buildzie
  - Wpływ: Zostaje tylko zmiana źródeł albo logi.
- Instrumentacja wszystkich metod com.firma (gettery, encje) zalewa plik i spowalnia aplikację wielokrotnie.
  - Jak rozpoznać: Miliony linii na jeden request
  - Wpływ: Szum i inna kolejność zdarzeń. Trzeba zawęzić do warstw (adnotacje stereotypów, *Service, *Dao, *Repository) i pominąć gettery i settery.
- Starsze Byte Buddy mają inną sygnaturę AgentBuilder.Transformer.transform: bez ProtectionDomain (4 argumenty zamiast 5). Lambda z 5 argumentami się nie skompiluje.
  - Jak rozpoznać: byte-buddy 1.10/1.11 w zależnościach agenta (np. współdzielony z inną biblioteką)
  - Wpływ: Agent nie buduje się dla starszej wersji. Najlepiej shadować własną wersję Byte Buddy w jarze agenta.
- Byte Buddy 1.18.9 wyłączył domyślne użycie Unsafe na Java 25+, a 1.18.10 przesunął tę zmianę na Java 26. Dotyczy wstrzykiwania klas pomocniczych (ClassInjector), nie samego inline Advice.
  - Jak rozpoznać: Agent używa MethodDelegation albo klas pomocniczych zamiast czystego Advice; błędy wstrzykiwania na JDK 26
  - Wpływ: Część transformacji może się nie udać. Czysty Advice inline + Diag w bootstrap/system CL omija problem.

**AspectJ load-time weaving (aspectjweaver jako javaagent + zewnętrzny aop.xml)**

- Klasy załadowane przed weaverem (np. przez wcześniejszy agent albo z bootstrap classloadera) nie zostaną wplecione.
  - Jak rozpoznać: Brak weaveinfo dla klasy, którą widać w stack trace
  - Wpływ: Dziury w przebiegu.
- Na serwerach aplikacyjnych weaver musi działać na classloaderze aplikacji. W Tomcacie bez -javaagent trzeba TomcatInstrumentableClassLoader albo InstrumentationLoadTimeWeaver Springa.
  - Jak rozpoznać: weaveinfo widać tylko dla klas z classpath systemowego
  - Wpływ: Klasy z WEB-INF/classes zostają niewplecione.
- Pointcut execution(* com.firma..*(..)) łapie także lambdy (lambda$foo$0) i klasy generowane (MapStruct, builder z Lomboka).
  - Jak rozpoznać: Metody lambda$ i klasy *Impl w zdarzeniach
  - Wpływ: Szum. Trzeba wykluczyć metody syntetyczne i pakiety generowane.
- Wersja aspectjweaver musi znać wersję Javy: 1.9.8 dla 17, 1.9.21 dla 21, 1.9.22 dla 22, 1.9.23 dla 23, 1.9.24 dla 24, 1.9.25 dla 25, 1.9.26 dla 26.
  - Jak rozpoznać: BCException albo błąd nieobsługiwanej wersji class file w logu weavera
  - Wpływ: Weaving się nie udaje i aspekt nie działa.
- AspectJ 1.9.7 do 1.9.21.0 na Java 16+: weaver koliduje z JEP 396 i wymaga --add-opens java.base/java.lang=ALL-UNNAMED. Od 1.9.21.1 nie jest to potrzebne.
  - Jak rozpoznać: InaccessibleObjectException / błędy definiowania klas przy starcie weavera, JDK 16+, aspectjweaver < 1.9.21.1
  - Wpływ: Część aspektów (np. concrete-aspect generowany w runtime) się nie definiuje, przebieg ma dziury.
- Abstrakcyjny aspekt w natywnej składni .aj (around(): ... proceed()) trzeba skompilować ajc. Zwykły javac go nie zbuduje.
  - Jak rozpoznać: Pliki .aj w jarze diagnostycznym, brak aspectj-maven-plugin
  - Wpływ: concrete-aspect nie znajduje bazowego aspektu i weaver go pomija. Bezpieczniej używać stylu adnotacji @AspectJ.

**JFR Method Timing & Tracing (JEP 520), bez agenta i bez zmian w kodzie**

- Nie da się instrumentować metod abstrakcyjnych, natywnych ani niestatycznych niedomyślnych metod interfejsu. Repozytoria Spring Data to interfejsy, więc trzeba celować w SimpleJpaRepository.
  - Jak rozpoznać: Filtr na interfejs repozytorium nie daje żadnych zdarzeń
  - Wpływ: Brak warstwy dostępu do danych.
- Celem JEP nie jest śledzenie dużej liczby metod naraz. JFR przy tej funkcji nie trzyma się swojego celu narzutu poniżej 1% CPU.
  - Jak rozpoznać: Szeroki filtr (wiele klas, adnotacja na wielu klasach)
  - Wpływ: Spadek wydajności, zmienione czasy i kolejność wątków.
- Specyfikacja nie opisuje obsługi meta-adnotacji. @GetMapping jest meta-adnotowane @RequestMapping, więc filtr @RequestMapping może nie złapać metod z samym @GetMapping (do sprawdzenia empirycznie).
  - Jak rozpoznać: Brak zdarzeń mimo kontrolerów z @GetMapping
  - Wpływ: Brak punktów wejścia. Pewniejsza jest adnotacja klasowa (@RestController / @Controller), która obejmuje wszystkie metody klasy.
- Filtr przyjmuje klasę, metodę (Klasa::metoda) albo adnotację, a nie pakiet. Zapis typu com.firma.service nie oznacza całego pakietu.
  - Jak rozpoznać: Filtr bez :: i bez @, wskazujący pakiet
  - Wpływ: Brak zdarzeń dla warstwy. Klasy trzeba wymienić albo użyć adnotacji stereotypu (@Service jako adnotacja klasowa).
- jdk.MethodTrace to jedno zdarzenie na wywołanie, zapisywane po zakończeniu metody. Nie ma osobnego zdarzenia wejścia.
  - Jak rozpoznać: Brak zdarzeń dla metod, które jeszcze trwają albo rzuciły wyjątek w chwili zrzutu
  - Wpływ: Kolejność in/out trzeba odtworzyć z startTime i duration. Długie wywołania trwające w chwili zrzutu nie pojawią się wcale.

**Narzędzia attach bez restartu: Arthas trace/watch, Byteman rules, BTrace**

- JEP 451: na JDK 21+ dynamiczny attach wypisuje ostrzeżenie, a w przyszłych wersjach będzie wymagał -XX:+EnableDynamicAgentLoading.
  - Jak rozpoznać: WARNING: A Java agent has been loaded dynamically
  - Wpływ: Na produkcji z polityką bez ostrzeżeń narzędzie może zostać zablokowane.
- Arthas trace śledzi tylko 1 poziom wywołań w metodzie wskazanej wzorcem, a nie całe drzewo w głąb.
  - Jak rozpoznać: Drzewo kończy się na wywołaniach bez dzieci
  - Wpływ: Przy naiwnym użyciu brakuje warstw. Trzeba podać kilka wzorców (-E) albo powtórzyć trace.
- Zmienione klasy zostają zmienione do końca życia JVM, dopóki nie wykona się reset (Arthas) albo usunięcia reguł (bmsubmit -u).
  - Jak rozpoznać: Po sesji nadal widać narzut
  - Wpływ: Instrumentacja zostaje po zakończeniu diagnozy.
- Reguły Byteman na klasach JDK (java.*) albo z bootstrap classloadera wymagają agenta w boot classpath (boot:byteman.jar) i -Dorg.jboss.byteman.transform.all. Wywołanie Diag z reguły wymaga, żeby Diag był widoczny z classloadera instrumentowanej klasy.
  - Jak rozpoznać: Reguła na java.sql.* albo java.util.concurrent.*; w trybie verbose błędy typecheck reguły
  - Wpływ: Reguła się nie wstrzykuje i zdarzeń nie ma.

**Diagnostyka samą konfiguracją logowania Springa (MVC/WebFlux/tx/JDBC/Hibernate)**

- Komunikaty TransactionAspectSupport są na TRACE, nie DEBUG. Na DEBUG widać tylko komunikaty menedżera transakcji, a przy 'Participating' nie ma nazwy metody.
  - Jak rozpoznać: Brak 'Getting transaction for' mimo DEBUG
  - Wpływ: Nie widać, która metoda otworzyła transakcję albo do niej dołączyła.
- Nazwa transakcji to klasa.metoda liczona z klasy celu (ClassUtils.getQualifiedMethodName(method, targetClass)), czyli klasy implementacji, a nie interfejsu, także przy JDK proxy. Dla metody odziedziczonej z klasy bazowej też widać klasę celu. TransactionTemplate daje nazwę null, chyba że ktoś wywołał setName.
  - Jak rozpoznać: 'Creating new transaction with name [null]'
  - Wpływ: Transakcji z TransactionTemplate nie da się przypiąć do klasy. Trzeba korelować z sąsiednimi liniami tego samego wątku.
- Spring Data JPA: każda metoda repozytorium bez otaczającej transakcji otwiera własną (readOnly dla metod odczytu) z nazwą org.springframework.data.jpa.repository.support.SimpleJpaRepository.findById.
  - Jak rozpoznać: Transakcje z nazwą SimpleJpaRepository.*
  - Wpływ: Wyglądają jak osobne jednostki pracy, choć to jeden use case.
- Starsze Spring (3.x/4.x) logowały mapowanie inaczej, na DEBUG: 'DispatcherServlet with name '...' processing GET request for [...]', 'Looking up handler method for path /orders/1', 'Returning handler method [...]', 'Successfully completed request'.
  - Jak rozpoznać: Wersja spring-webmvc < 5.1
  - Wpływ: Regexy parsera trzeba dobrać do wersji.
- Pule wątków (@Async, WebFlux, wirtualne wątki) łamią założenie, że jeden wątek to jeden request.
  - Jak rozpoznać: %thread typu task-1, reactor-http-nio-2, boundedElastic-3
  - Wpływ: Sklejanie po wątku daje mieszane przebiegi. W WebFlux trzeba korelować po logId.
- spring.jpa.show-sql=true (hibernate.show_sql) pisze SQL na System.out, z pominięciem loggera.
  - Jak rozpoznać: Linie 'Hibernate: select ...' bez znacznika czasu i wątku
  - Wpływ: SQL bez wątku i czasu nie daje się przypiąć do requestu. Trzeba logger org.hibernate.SQL zamiast show-sql.
- Aplikacja Spring bez Boota (legacy) nie rozumie logging.level.* ani zmiennych LOGGING_LEVEL_*. Często ma Log4j 1.x (log4j.properties) albo commons-logging na JUL.
  - Jak rozpoznać: Brak spring-boot w zależnościach, log4j.properties / log4j.xml / logging.properties w WEB-INF/classes
  - Wpływ: Poziomy trzeba zmienić w pliku konfiguracji logowania w artefakcie albo przez -Dlog4j.configuration=file:/diag/log4j.properties.

**Proxy JDBC: P6Spy i datasource-proxy (konfiguracja, bez zmian w kodzie)**

- Na serwerze aplikacyjnym DataSource z JNDI (java:jboss/datasources/X) tworzy serwer. Podmiana URL w kodzie nic nie da. Trzeba zmienić definicję datasource w standalone.xml/domain.xml/context.xml i dograć moduł p6spy.
  - Jak rozpoznać: @Resource(lookup=...), <jta-data-source>, jndi-name w Spring XML
  - Wpływ: SQL nie jest widoczny.
- Kategoria commit/rollback w P6Spy to commit na poziomie Connection. W JTA (XA) commit idzie przez XAResource, więc zdarzeń commit nie ma. Przy autocommit=true też ich nie ma.
  - Jak rozpoznać: XA datasource, <xa-datasource>, Atomikos/Narayana
  - Wpływ: Granice transakcji trzeba wziąć z hooka JTA.
- Batch: Hibernate z hibernate.jdbc.batch_size grupuje INSERT/UPDATE i wysyła je przy flush/commit, a nie w miejscu save().
  - Jak rozpoznać: Kategoria batch, Batch:True w datasource-proxy
  - Wpływ: SQL jest przypisany do metody, która zrobiła flush, a nie do tej, która zmieniła encję. Trzeba to pokazywać jako 'sql przy flush'.
- Starter dekoruje wszystkie beany DataSource, także własne beany aplikacji, w kolejności P6DataSource -> ProxyDataSource -> FlexyPoolDataSource -> DataSource. Pominięte zostają beany z decorator.datasource.exclude-beans, a przy decorator.datasource.enabled=false wszystko. DataSource spoza kontekstu Springa (new HikariDataSource() w kodzie, JNDI pobierane ręcznie) nie jest dekorowany.
  - Jak rozpoznać: Brak logów mimo startera; exclude-beans w konfiguracji; DataSource tworzony poza @Bean
  - Wpływ: Brak SQL dla części połączeń.
- AbstractRoutingDataSource (multi-tenant, read/write split) jest dekorowany razem ze swoimi docelowymi DataSource, jeśli te też są beanami.
  - Jak rozpoznać: Klasa rozszerzająca AbstractRoutingDataSource; zdublowane linie SQL
  - Wpływ: Każdy SQL dwa razy. Trzeba ustawić decorator.datasource.ignore-routing-data-sources=true.
- connectionId to identyfikator połączenia z puli, a nie wątku. Jedno połączenie obsługuje po kolei różne requesty.
  - Jak rozpoznać: Ten sam connectionId w różnych wątkach
  - Wpływ: Korelować po wątku albo kor, a nie po połączeniu.

**Hibernate StatementInspector (hook SQL na poziomie ORM)**

- inspect() działa w chwili przygotowania SQL, a nie wykonania. Nie ma czasu wykonania ani parametrów. Batch to jedno inspect dla wielu wykonań.
  - Jak rozpoznać: Liczba zdarzeń sql mniejsza niż w P6Spy przy batchach
  - Wpływ: Gdy potrzebne są czasy, trzeba łączyć z proxy JDBC.
- Hibernate 4.x nie ma StatementInspector, jest tylko Interceptor.onPrepareStatement (deprecated w 5).
  - Jak rozpoznać: hibernate-core 4.x (legacy Spring 3/4)
  - Wpływ: Trzeba użyć Interceptor.
- Zapytania przez Session.doWork / ReturningWork / entityManager.unwrap(Connection) i JDBC obok Hibernate nie przechodzą przez inspector.
  - Jak rozpoznać: Work/ReturningWork, unwrap(Connection), JdbcTemplate obok JPA
  - Wpływ: Dziury w SQL.
- W Quarkus konfiguracja jest build-time. Hook rejestruje się jako bean CDI z @PersistenceUnitExtension, a nie przez nazwę klasy w application.properties.
  - Jak rozpoznać: quarkus-hibernate-orm w pom
  - Wpływ: Hook się nie zarejestruje.
- spring.jpa.properties.* działa tylko dla EntityManagerFactory z auto-konfiguracji Boota. Własny LocalContainerEntityManagerFactoryBean z setJpaPropertyMap tych kluczy nie dostaje.
  - Jak rozpoznać: @Bean LocalContainerEntityManagerFactoryBean w kodzie, kilka persistence unitów
  - Wpływ: Inspector nie działa dla tej jednostki. Zostaje persistence.xml albo zmiana kodu konfiguracji.

**Doklejany jar z auto-konfiguracją Spring Boot (PropertiesLauncher loader.path), bez zmian w źródłach**

- ExecutionListenersTransactionManagerCustomizer (Boot 3.2+) dodaje listenery tylko do menedżerów transakcji tworzonych przez auto-konfigurację. Własny @Bean JpaTransactionManager w aplikacji ich nie dostanie.
  - Jak rozpoznać: @Bean PlatformTransactionManager / JpaTransactionManager w kodzie aplikacji
  - Wpływ: Brak zdarzeń tx. Trzeba BeanPostProcessor, który woła ((ConfigurableTransactionManager)tm).addListener(...).
- Auto-konfiguracja Kafki w Boot bierze RecordInterceptor przez ObjectProvider.getIfUnique(). Jeśli aplikacja ma już własny RecordInterceptor, przy dwóch beanach nie zostanie podpięty żaden.
  - Jak rozpoznać: Istniejący bean RecordInterceptor; własna ConcurrentKafkaListenerContainerFactory
  - Wpływ: Można zepsuć istniejące zachowanie. Trzeba CompositeRecordInterceptor albo BeanPostProcessor na fabryce.
- Aplikacja uruchamiana jako WAR na zewnętrznym Tomcacie albo z warstw (layers, exploded) nie przechodzi przez PropertiesLauncher.
  - Jak rozpoznać: packaging war, SpringBootServletInitializer, Dockerfile z COPY BOOT-INF/lib albo java -cp ... z klasą Start-Class
  - Wpływ: Jar trzeba dograć do WEB-INF/lib albo do katalogu lib w obrazie.
- Boot 3.0+ nie czyta auto-konfiguracji z spring.factories, tylko z AutoConfiguration.imports.
  - Jak rozpoznać: Wersja spring-boot >= 3
  - Wpływ: Jar diagnostyczny zostaje po cichu zignorowany.
- Boot 4 rozbił auto-konfigurację na moduły (np. org.springframework.boot.transaction.autoconfigure, org.springframework.boot.kafka.autoconfigure). @AutoConfiguration(after=...) i @ConditionalOnClass wskazujące stare nazwy klas z Boot 3 nie zadziałają.
  - Jak rozpoznać: spring-boot 4.x, brak spring-boot-autoconfigure jako jednego jara
  - Wpływ: Auto-konfiguracja diagnostyczna nie pasuje albo ładuje się w złej kolejności. Trzeba osobnych wariantów jara dla Boot 2/3 i 4.

**Filtr wejścia: Servlet Filter / OncePerRequestFilter / HandlerInterceptor / WebFilter (zmiana w kopii repo)**

- Asynchroniczne requesty (DeferredResult, Callable, StreamingResponseBody, CompletableFuture w kontrolerze) wracają do filtra jako osobny dispatch DispatcherType.ASYNC na innym wątku. OncePerRequestFilter domyślnie pomija dispatch ASYNC (shouldNotFilterAsyncDispatch()=true).
  - Jak rozpoznać: Typy zwracane DeferredResult/Callable/CompletableFuture w MVC, request.isAsyncStarted()
  - Wpływ: out pada przed końcem pracy, a SQL z wątku async ma kor=null.
- Strona błędu: przy wyjątku kontener robi ERROR dispatch na /error (BasicErrorController). Boot rejestruje beany OncePerRequestFilter dla wszystkich typów dispatchu, ale sam OncePerRequestFilter domyślnie pomija ERROR (shouldNotFilterErrorDispatch()=true). Drugie in/out dla /error pojawia się dla zwykłego Filter zarejestrowanego z ERROR albo gdy ktoś nadpisze shouldNotFilterErrorDispatch.
  - Jak rozpoznać: Zdarzenia in dla /error; zwykły Filter (nie OncePerRequestFilter) z dispatcherTypes zawierającym ERROR
  - Wpływ: Fałszywy drugi request.
- Kolejność: filtr Spring Security (DelegatingFilterProxy, order -100 = SecurityProperties.DEFAULT_FILTER_ORDER) albo filtry aplikacji przed naszym mogą odrzucić request (401) zanim nasz filtr go zobaczy.
  - Jak rozpoznać: FilterRegistrationBean order, SecurityProperties.DEFAULT_FILTER_ORDER
  - Wpływ: Brak in dla odrzuconych. Rozwiązanie: Ordered.HIGHEST_PRECEDENCE.
- Boot 3 / Jakarta EE 9+ to pakiet jakarta.servlet, Boot 2 i Java EE to javax.servlet. Filtr skompilowany na zły pakiet nie zostanie załadowany.
  - Jak rozpoznać: import javax.servlet vs jakarta.servlet w kodzie aplikacji
  - Wpływ: ClassNotFoundException albo filtr po cichu niezarejestrowany.
- WebFlux: ThreadLocal w filtrze nie działa, bo wątki zmieniają się między operatorami. Trzeba Hooks.enableAutomaticContextPropagation() (Reactor 3.5.3+, io.micrometer:context-propagation na classpath) albo spring.reactor.context-propagation=auto (Boot 3.2+) i ThreadLocalAccessor dla Diag.KOR.
  - Jak rozpoznać: spring-boot-starter-webflux, Mono/Flux w kontrolerach
  - Wpływ: SQL/R2DBC i logi bez kor albo z kor innego requestu.
- HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE nie istnieje w starszych Spring (dodany w późnych 4.3.x). W Spring 3.x/wczesnych 4.x trzeba wziąć handler z HandlerInterceptor.preHandle albo z atrybutu BEST_MATCHING_PATTERN_ATTRIBUTE (sam wzorzec ścieżki).
  - Jak rozpoznać: spring-webmvc 3.x / 4.0-4.2
  - Wpływ: Filtr się nie kompiluje albo out nie ma klasy kontrolera.

**Aspekt Spring AOP na klasach (@Aspect / XML <aop:config>, zmiana w kopii repo)**

- Self-invocation: this.innaMetoda() omija proxy. Nie ma zdarzenia ani transakcji, co zgadza się z działaniem @Transactional.
  - Jak rozpoznać: Wywołania metod tej samej klasy bez wstrzykniętego self
  - Wpływ: Brak kroków wewnątrz klasy. To nie błąd diagnostyki, tylko obraz zachowania proxy.
- Metody private, final i static oraz klasy final (Kotlin bez kotlin-allopen) nie są przechwytywane przez proxy CGLIB.
  - Jak rozpoznać: final w sygnaturach, Kotlin bez plugin.spring
  - Wpływ: Dziury w przebiegu.
- Repozytoria Spring Data to JDK proxy interfejsu z celem SimpleJpaRepository / SimpleJdbcRepository. within(com.firma..*) nie łapie findById odziedziczonego z CrudRepository, bo metodę deklaruje typ spoza pakietu.
  - Jak rozpoznać: Interfejsy extends JpaRepository/CrudRepository
  - Wpływ: Brak warstwy repozytorium. Pointcut musi używać Repository+ albo target().
- Kolejność względem TransactionInterceptor (domyślnie LOWEST_PRECEDENCE). Z HIGHEST_PRECEDENCE in jest przed begin, a out po commit. Przy odwrotnej kolejności wyjątek z commit (np. konflikt optimistic lock) nie jest widoczny w out.
  - Jak rozpoznać: @Order na aspekcie, @EnableTransactionManagement(order=...)
  - Wpływ: Inna kolejność in/tx i zgubione błędy commit.
- Beany tworzone przed rejestracją auto-proxy (BeanPostProcessor, ich zależności, beany infrastruktury) nie dostają proxy.
  - Jak rozpoznać: 'Bean 'x' of type [...] is not eligible for getting processed by all BeanPostProcessors' (INFO w starszych Spring, WARN w Spring 6.2+)
  - Wpływ: Część klas bez zdarzeń.
- WebFlux: aspekt widzi tylko złożenie Mono, a nie jego wykonanie, więc out pada natychmiast.
  - Jak rozpoznać: Metody zwracające Mono/Flux
  - Wpływ: Trzeba owinąć wynik (doFinally) zamiast finally.
- @Aspect wymaga aspectjweaver na classpath. W Boot bez niego AopAutoConfiguration tworzy tylko infrastrukturalny auto-proxy creator, a klasa z @Aspect zostaje zwykłym beanem bez działania.
  - Jak rozpoznać: Brak spring-boot-starter-aop/-aspectj ani aspectjweaver w drzewie zależności
  - Wpływ: Aspekt po cichu nic nie robi. Zostaje advisor z MethodInterceptor (aopalliance) albo dołożenie jara.
- Boot 4 zmienił nazwę startera: spring-boot-starter-aop to teraz spring-boot-starter-aspectj.
  - Jak rozpoznać: spring-boot 4.x i błąd rozwiązywania zależności spring-boot-starter-aop
  - Wpływ: Kopia repo z dopisanym starym starterem się nie buduje.

**Hooki transakcji: TransactionExecutionListener (Spring 6.1+), TransactionSynchronization, JTA TransactionSynchronizationRegistry**

- TransactionSynchronization jest rejestrowana per fizyczna transakcja. Przy PROPAGATION_REQUIRED kolejne metody uczestniczą i nie dostają osobnego begin. Przy REQUIRES_NEW synchronizacje zewnętrznej transakcji są zawieszane.
  - Jak rozpoznać: propagation w @Transactional
  - Wpływ: Jedna transakcja na kilka metod. Trzeba odróżniać 'participating' od 'new' (TransactionStatus.isNewTransaction()).
- PROPAGATION_SUPPORTS / NOT_SUPPORTED / NEVER bez istniejącej transakcji tworzą 'pustą' transakcję: synchronizacja jest aktywna (domyślne SYNCHRONIZATION_ALWAYS), a fizycznej transakcji JDBC nie ma. readOnly=true z REQUIRED to normalna, fizyczna transakcja tylko do odczytu, a nie pusta.
  - Jak rozpoznać: Propagation.SUPPORTS/NOT_SUPPORTED/NEVER
  - Wpływ: TransactionSynchronization pokaże zakończenie transakcji, której w bazie nie było.
- Kilka menedżerów transakcji (@Transactional("otherTm"), ChainedTransactionManager, KafkaTransactionManager). Listener podpięty do jednego nie widzi pozostałych.
  - Jak rozpoznać: Kilka beanów PlatformTransactionManager, transactionManager w adnotacji
  - Wpływ: Część transakcji niewidoczna.
- EJB CMT: domyślnie REQUIRED na każdej metodzie biznesowej beana sesyjnego bez adnotacji. Transakcja istnieje mimo braku @TransactionAttribute w kodzie.
  - Jak rozpoznać: @Stateless/@Singleton bez @TransactionAttribute; ejb-jar.xml <container-transaction>
  - Wpływ: Statyczne rozpoznanie 'brak transakcji' jest błędne.
- Rollback przez wyjątek: Spring domyślnie wycofuje tylko dla RuntimeException/Error, EJB tylko dla wyjątków systemowych albo @ApplicationException(rollback=true).
  - Jak rozpoznać: Checked exceptions, rollbackFor, @ApplicationException
  - Wpływ: Naiwne założenie 'wyjątek = rollback' bywa fałszywe. Hook pokazuje faktyczny wynik.
- TransactionExecutionListener nie jest wołany przy 'Participating in existing transaction', przy pustej transakcji (SUPPORTS) ani przy zawieszeniu. Dostaje tylko nowe fizyczne transakcje i savepointy (NESTED).
  - Jak rozpoznać: Spring 6.1+, metody z REQUIRED wołane wewnątrz innej transakcji
  - Wpływ: Zdarzenie begin tylko dla najbardziej zewnętrznej metody. Do przypisania metod uczestniczących trzeba aspektu albo logów TRACE TransactionInterceptor.
- Uczestnicząca metoda rzuca RuntimeException złapany wyżej: transakcja zostaje oznaczona rollback-only, a commit zewnętrznej kończy się UnexpectedRollbackException ('Transaction silently rolled back because it has been marked as rollback-only').
  - Jak rozpoznać: try/catch wokół wywołania @Transactional(REQUIRED) w innej metodzie @Transactional
  - Wpływ: Kod 'robi commit', a w bazie jest rollback. Listener pokaże beforeCommit, a potem rollback.

**Hooki SQL w bibliotekach niebędących JPA: MyBatis Interceptor, jOOQ ExecuteListener, Querydsl SQLListener, JdbcTemplate**

- MyBatis z CachingExecutor: przy trafieniu w cache drugiego poziomu (<cache/>) albo w lokalny cache sesji (localCacheScope=SESSION) nie ma SQL, a Executor.query i tak jest wołany.
  - Jak rozpoznać: <cache/> w mapperze, powtórne zapytanie w tej samej SqlSession/transakcji
  - Wpływ: Zdarzenie 'sql' bez faktycznego SQL. Do faktycznego SQL trzeba przechwytywać StatementHandler.prepare.
- MyBatis batch (ExecutorType.BATCH): update zwraca BATCH_UPDATE_RETURN_VALUE, a SQL leci przy flushStatements/commit.
  - Jak rozpoznać: ExecutorType.BATCH, SqlSessionTemplate(sf, BATCH)
  - Wpływ: SQL odroczony, podobnie jak flush Hibernate.
- Kilka pluginów MyBatis (np. PageHelper) zmienia SQL i argumenty, a kolejność owijania jest odwrotna do kolejności deklaracji.
  - Jak rozpoznać: com.github.pagehelper.PageInterceptor
  - Wpływ: Zapisany SQL może nie być tym wykonanym, np. bez LIMIT. Trzeba przechwytywać najgłębiej (StatementHandler).
- Dynamiczny SQL MyBatis (<if>, <foreach>) i jOOQ budujący zapytania w runtime są niewidoczne statycznie. Hook to jedyny pewny sposób poznania SQL.
  - Jak rozpoznać: <if test=...> w XML, DSL.condition(...) składane warunkowo
  - Wpływ: Analiza statyczna zgaduje tabele.
- jOOQ: Settings.withExecuteLogging(false) albo własny ExecuteListenerProvider zastępujący listę w niestandardowej konfiguracji (bez Boota).
  - Jak rozpoznać: new DefaultConfiguration().set(...) w kodzie
  - Wpływ: Nasz listener może zostać nadpisany.
- Sygnatura StatementHandler.prepare zmieniła się w MyBatis 3.4.0: wcześniej prepare(Connection), od 3.4.0 prepare(Connection, Integer transactionTimeout). @Signature z błędnymi args rzuca błąd przy starcie.
  - Jak rozpoznać: Wersja mybatis < 3.4 w legacy; PluginException 'Could not find method on interface ...'
  - Wpływ: Plugin nie startuje albo aplikacja nie wstaje. args trzeba dobrać do wersji.

**Jakarta EE / Java EE: interceptory CDI/EJB, filtry JAX-RS, handlery JAX-WS, MDB**

- Domyślny interceptor z ejb-jar.xml obejmuje tylko EJB w tym module (ejb-jar albo WAR). Nie obejmuje beanów CDI ani POJO. Bean z @ExcludeDefaultInterceptors go pomija.
  - Jak rozpoznać: @ExcludeDefaultInterceptors, <exclude-default-interceptors>, logika w POJO wołanych z EJB
  - Wpływ: Warstwy POJO niewidoczne.
- Interceptory CDI działają tylko na beanach zarządzanych wywołanych przez proxy. Self-invocation i obiekty tworzone przez new są pomijane. Przy bean-discovery-mode=annotated klasy bez bean-defining annotation nie są beanami.
  - Jak rozpoznać: beans.xml bean-discovery-mode="annotated"/"none"
  - Wpływ: Dziury podobne jak przy Spring AOP.
- Kolejność interceptorów EJB względem transakcji CMT: interceptor @AroundInvoke działa wewnątrz kontekstu transakcji kontenera, więc commit następuje po out.
  - Jak rozpoznać: CMT (domyślne)
  - Wpływ: Błąd commit pojawia się po out i bez naszego zdarzenia. Trzeba dodać hook JTA.
- Async EJB (@Asynchronous), MDB i timery (@Schedule) działają w innych wątkach bez naszego ThreadLocal. Wejściem jest interceptor, a kor trzeba wziąć z nagłówka JMS (JMSCorrelationID albo własna właściwość).
  - Jak rozpoznać: @Asynchronous, @MessageDriven, @Schedule, @Timeout
  - Wpływ: Osobne przebiegi zamiast kontynuacji.
- Pakiety javax.* (Java EE 8 / Jakarta EE 8) vs jakarta.* (Jakarta EE 9+). Interceptor skompilowany na złą przestrzeń nazw jest ignorowany.
  - Jak rozpoznać: Wersja serwera (WildFly 27+ = jakarta), importy w kodzie
  - Wpływ: Cicha nieskuteczność.
- @Priority(PLATFORM_BEFORE) ustawia nasz interceptor przed interceptorem @jakarta.transaction.Transactional (PLATFORM_BEFORE + 200). Przy @Transactional w CDI out jest więc po commit, odwrotnie niż przy EJB CMT. Z priorytetem z zakresu APPLICATION byłby wewnątrz transakcji.
  - Jak rozpoznać: @jakarta.transaction.Transactional na beanach CDI, wartość @Priority interceptora
  - Wpływ: Inna kolejność in/tx/out w zależności od priorytetu i rodzaju transakcji. Parser musi to uwzględnić.

**Wejścia z komunikatów: Kafka, RabbitMQ, JMS (Spring), Spring Integration**

- ConsumerInterceptor.onConsume działa w poll() dla całej paczki rekordów, zanim listener je dostanie. Nie zna granicy przetwarzania pojedynczego rekordu. Instancję tworzy klient Kafki, nie Spring, więc nie ma wstrzykiwania beanów.
  - Jak rozpoznać: interceptor.classes w konfiguracji
  - Wpływ: Daje tylko 'in' dla paczki, bez 'out' per rekord. RecordInterceptor jest dokładniejszy.
- RecordInterceptor nie działa dla listenerów batch (List<ConsumerRecord>), tam trzeba BatchInterceptor. Od spring-kafka 2.8 interceptor domyślnie wykonuje się przed startem transakcji (interceptBeforeTx=true), a od 2.9 dotyczy to każdego menedżera transakcji, nie tylko KafkaAwareTransactionManager.
  - Jak rozpoznać: factory.setBatchListener(true), spring.kafka.listener.type=batch, containerProperties.setInterceptBeforeTx(false)
  - Wpływ: Brak in dla wejścia batch albo inna kolejność in/tx.
- Ponowienia (DefaultErrorHandler, @RetryableTopic, retry w Rabbit) dają kilka in dla tego samego rekordu, a przy @RetryableTopic na innym topicu (orders-retry-0).
  - Jak rozpoznać: @RetryableTopic, DefaultErrorHandler(BackOff), spring.rabbitmq.listener.simple.retry.enabled
  - Wpływ: Duplikaty przebiegów. Trzeba scalać po offset/messageId.
- Spring Integration: kanały QueueChannel/ExecutorChannel zmieniają wątek, więc ThreadLocal z kor ginie. Kor trzeba przenosić w nagłówku i ustawiać w interceptorze (beforeHandle w ExecutorChannelInterceptor).
  - Jak rozpoznać: <int:queue/>, ExecutorChannel, poller
  - Wpływ: Przebieg rozpada się na kawałki.
- Spring Cloud Stream: @StreamListener jest deprecated od 3.1 i usunięty w 4.0. W nowszych wersjach wejściem są funkcyjne beany (Consumer/Function), a pod spodem kontener binder-a (np. Kafka).
  - Jak rozpoznać: spring-cloud-stream 4.x, beany Function/Consumer, spring.cloud.function.definition
  - Wpływ: Aspekt na @StreamListener nic nie złapie. Trzeba celować w beany funkcyjne albo w interceptor kontenera bindera.

**Wejścia z harmonogramów: Quartz listeners (konfiguracja), @Scheduled, @Async i TaskDecorator**

- Quartz z JobStore JDBC i klastrowaniem: job może wystartować w innej instancji. Plik JSONL z jednej JVM go nie pokaże.
  - Jak rozpoznać: org.quartz.jobStore.isClustered=true, spring.quartz.job-store-type=jdbc
  - Wpływ: Brak przebiegu w jednym pliku. Trzeba zbierać pliki ze wszystkich instancji.
- Spring SchedulerFactoryBean nie czyta quartz.properties z classpath, chyba że ustawiono configLocation. Konfigurację daje setQuartzProperties albo, w Boot, spring.quartz.properties.*. Własny @Bean SchedulerFactoryBean w aplikacji wyłącza auto-konfigurację Quartz w Boot, a razem z nią spring.quartz.properties.
  - Jak rozpoznać: @Bean SchedulerFactoryBean w kodzie; quartz.properties w resources bez configLocation
  - Wpływ: Listener się nie rejestruje.
- @Scheduled domyślnie działa na jednowątkowym schedulerze (scheduling-1). Długi job blokuje kolejne, które potem odpalają się seriami (fixedRate).
  - Jak rozpoznać: Brak spring.task.scheduling.pool.size
  - Wpływ: Zdarzenia 'in' w nienaturalnych odstępach. Wątek jest ten sam, więc kor trzeba nadawać per wykonanie, a nie per wątek.
- @Async bez TaskDecorator: kontynuacja w task-N bez kor. @Async na metodzie wołanej z tej samej klasy (self-invocation) działa synchronicznie.
  - Jak rozpoznać: @EnableAsync, @Async
  - Wpływ: Osierocone zdarzenia albo błędne założenie, że coś jest asynchroniczne.
- Quartz 1.x ma inne API: nie ma JobKey/TriggerKey (getTrigger().getName()/getGroup()) ani getFireInstanceId(), a JobDetail i Trigger to klasy, nie interfejsy.
  - Jak rozpoznać: quartz 1.x (org.opensymphony.quartz albo quartz-1.*.jar) w legacy Spring 2.5/3.0
  - Wpływ: Listener z Quartz 2.x rzuca NoSuchMethodError. Trzeba osobnej wersji i własnego kor (UUID).

**Axon Framework: MessageHandlerInterceptor / MessageDispatchInterceptor i CorrelationDataProvider**

- Procesory tracking/pooled-streaming działają w osobnych wątkach i z opóźnieniem. Ten sam event jest przetwarzany osobno przez każdą grupę procesorów, także po replayu (reset tokenu).
  - Jak rozpoznać: TrackingEventProcessor, PooledStreamingEventProcessor, @ProcessingGroup, ReplayStatus w handlerze
  - Wpływ: Przebieg komendy nie zawiera efektów handlerów zdarzeń. Trzeba je łączyć po correlationId, a replay daje fałszywe 'nowe' przebiegi.
- Agregaty event-sourced: odtworzenie stanu wywołuje @EventSourcingHandler dla wszystkich historycznych zdarzeń przy każdej komendzie.
  - Jak rozpoznać: @EventSourcingHandler, brak snapshottera
  - Wpływ: Instrumentacja na poziomie metod (agent/AOP) pokazuje setki wywołań. Interceptor magistrali ich nie liczy.
- Axon 5 zmienia API: interceptory dostają ProcessingContext zamiast UnitOfWork i zwracają MessageStream. Dokładnych sygnatur nie zweryfikowano.
  - Jak rozpoznać: axon-messaging 5.x
  - Wpływ: Kod pomocnika z Axon 4 się nie skompiluje.
- Rozproszona magistrala komend (Axon Server): handler może wykonać się w innej instancji aplikacji.
  - Jak rozpoznać: axon-server-connector, AxonServerCommandBus
  - Wpływ: Przebieg rozbity na pliki różnych JVM.

**Micronaut i Quarkus: interceptory compile/build-time, filtry, konfiguracja logów**

- Quarkus nie obsługuje CDI Portable Extensions (CDI Lite), więc nie da się dołożyć bindingu do wszystkich klas jarem z META-INF/services jak w Jakarta EE. Trzeba rozszerzenia z AnnotationsTransformer albo zmian w kodzie.
  - Jak rozpoznać: Quarkus + istniejący Extension w kodzie (ignorowany)
  - Wpływ: Interceptor bez efektu.
- Quarkus ArC usuwa nieużywane beany (quarkus.arc.remove-unused-beans). Bean diagnostyczny bez wstrzyknięć może zostać usunięty.
  - Jak rozpoznać: Brak zdarzeń; w logu budowania informacja o usuniętych beanach
  - Wpływ: Hook nieaktywny. Trzeba @Unremovable.
- Reaktywne stosy (Quarkus Vert.x event loop, Mutiny, Micronaut reactive/Netty): ThreadLocal nie działa. Quarkus ma Vert.x duplicated context, Micronaut 4 ma PropagatedContext.
  - Jak rozpoznać: Uni/Multi, @NonBlocking, Publisher w kontrolerach Micronaut
  - Wpływ: Kor ginie. Trzeba użyć mechanizmu propagacji frameworka.
- W native image (GraalVM) nie ma javaagenta ani dynamicznych proxy w runtime. Interceptor musi być znany przy budowaniu.
  - Jak rozpoznać: -Pnative, quarkus.package.type=native (w Quarkus 3: quarkus.native.enabled), micronaut native-image
  - Wpływ: Opcje 'bez zmian w kodzie' odpadają, poza logami.

**Legacy: Spring 3/4 XML i Struts 1/2, wstrzyknięcie przez deskryptory XML**

- Kontekst główny (ContextLoaderListener) i kontekst DispatcherServlet to dwa konteksty. <aop:config> w głównym nie obejmuje kontrolerów z *-servlet.xml i odwrotnie.
  - Jak rozpoznać: contextConfigLocation w web.xml dla listenera i dla servletu
  - Wpływ: Kontrolery albo serwisy niewidoczne.
- Spring < 3.2 wymaga cglib (cglib-nodep) na classpath dla proxy-target-class="true". Bez niego kontekst z klasami bez interfejsów nie wstaje.
  - Jak rozpoznać: spring-core 3.0/3.1, brak cglib w WEB-INF/lib
  - Wpływ: Aplikacja nie startuje. Bezpieczniej proxy-target-class="false" dla klas z interfejsami.
- Akcje Struts 2 tworzone przez ObjectFactory Struts (bez struts2-spring-plugin) nie są beanami Springa, więc aspekt Springa ich nie widzi i trzeba interceptora Struts. Akcje Struts 1 to singletony tworzone przez RequestProcessor.
  - Jak rozpoznać: Brak struts.objectFactory=spring
  - Wpływ: Brak warstwy wejściowej w AOP.
- Własny <interceptor-stack> w pakiecie akcji nadpisuje default-interceptor-ref. Akcje z jawnymi <interceptor-ref> nie dostaną naszego interceptora.
  - Jak rozpoznać: <interceptor-ref> wewnątrz <action>
  - Wpływ: Część akcji bez zdarzeń.
- Struts 7 przeniósł pakiety com.opensymphony.xwork2 do org.apache.struts2 i przeszedł na jakarta.servlet. Nazwy loggerów i klas bazowych interceptora są inne niż w 2.x.
  - Jak rozpoznać: struts2-core 7.x w zależnościach, importy org.apache.struts2.ActionInvocation
  - Wpływ: Interceptor z 2.x się nie kompiluje, a loggery com.opensymphony.xwork2 nic nie pokazują.
- Struts 1.3 domyślnie używa ComposableRequestProcessor (commons-chain, chain-config.xml). Własny processorClass rozszerzający klasyczny RequestProcessor omija łańcuch i zmienia zachowanie (np. walidację, Tiles).
  - Jak rozpoznać: struts-core 1.3.x, chain-config.xml, TilesRequestProcessor
  - Wpływ: Wstrzyknięcie zmienia przebieg, który diagnozujemy. Bezpieczniej filtr w web.xml albo komenda w chain-config.xml.

**Kontener servletów: Tomcat AccessLogValve / Undertow / Jetty RequestLog (konfiguracja, granice requestu z wątkiem)**

- Znaczenie czasu w %{...}t zależy od prefiksu: begin: to start requestu, end: (i domyślnie, według dokumentacji Tomcat 10.1) koniec odpowiedzi. Linie są zapisywane po zakończeniu requestu, więc kolejność w pliku to kolejność zakończeń, a nie startów.
  - Jak rozpoznać: Wzorzec %t / %{...}t bez prefiksu begin:/end:
  - Wpływ: Złe okna czasowe przy dopasowaniu do logów aplikacji, jeśli parser założy czas startu. Trzeba logować jawnie %{begin:...}t i %{end:...}t.
- Jednostka %D różni się wersją: Tomcat 10.1+ (Boot 3.x/4.x) zapisuje mikrosekundy, Tomcat 9 i starsze (Boot 2.x) milisekundy. %{ms}T przypina jednostkę.
  - Jak rozpoznać: Wersja tomcat-embed-core; wartości %D 1000 razy większe niż oczekiwane
  - Wpływ: in = ts - D przesunięte o rzędy wielkości, przez co dopasowanie okien jest błędne.
- Async servlet i WebFlux (Netty nie ma AccessLogValve; Reactor Netty ma -Dreactor.netty.http.server.accessLogEnabled=true, a wątek to event loop) psują założenie, że wątek z %I wykonał całą pracę.
  - Jak rozpoznać: spring-boot-starter-webflux, DeferredResult
  - Wpływ: Dopasowanie po wątku niemożliwe.
- Access log jest domyślnie buforowany (Tomcat buffered=true) i rotowany dziennie. Linie mogą pojawić się z opóźnieniem.
  - Jak rozpoznać: server.tomcat.accesslog.buffered
  - Wpływ: Przy krótkim teście brak linii. Trzeba ustawić buffered=false.
- Spring Boot 4 usunął obsługę Undertow (brak zgodności z Servlet 6.1). server.undertow.accesslog.* działa tylko do Boot 3.x. WildFly nadal używa Undertow.
  - Jak rozpoznać: spring-boot 4.x i spring-boot-starter-undertow w starej konfiguracji
  - Wpływ: Po migracji na Boot 4 access log Undertow znika. Trzeba Tomcat albo Jetty RequestLog.

**Micrometer Observation: jeden bean ObservationHandler zbiera HTTP, @Scheduled, Kafka/Rabbit, klientów HTTP i JDBC (Spring 6 / Boot 3+)**

- Spring 5 / Boot 2 nie mają Observation API. Tam metryki szły przez WebMvcMetricsFilter, a korelację w logach dawał Spring Cloud Sleuth (wzorzec [app,traceId,spanId] w każdej linii).
  - Jak rozpoznać: spring-boot 2.x, spring-cloud-starter-sleuth w zależnościach
  - Wpływ: Handler nie istnieje. W Boot 2 zostaje filtr/aspekt albo korelacja po traceId z Sleutha.
- Obserwacje Kafka/Rabbit są domyślnie wyłączone. Klienci HTTP są obserwowani tylko, gdy zostali zbudowani z auto-konfigurowanego buildera (RestTemplateBuilder, RestClient.Builder, WebClient.Builder).
  - Jak rozpoznać: Brak observation-enabled w konfiguracji; new RestTemplate() w kodzie
  - Wpływ: Brak wejść z kolejek albo wyjść HTTP w przebiegu.
- onStart/onStop mogą być wołane na różnych wątkach (WebFlux, async MVC, Kafka po zakończeniu przetwarzania). Do ThreadLocal służą onScopeOpened/onScopeClosed, a nie onStart.
  - Jak rozpoznać: Reaktywne kontrolery, DeferredResult
  - Wpływ: Kor ustawiony w onStart wycieka albo trafia na zły wątek.
- Obserwacja HTTP server ma ograniczony kontekst: daje route (http.url / uri tag), ale nie klasę i metodę kontrolera.
  - Jak rozpoznać: Tagi uri=/orders/{id} bez nazwy handlera
  - Wpływ: Klasę kontrolera trzeba dołożyć z HandlerInterceptor albo aspektu.

**Proxy R2DBC (r2dbc-proxy) i logi Spring R2DBC dla stosów reaktywnych**

- Brak ThreadLocal: listener wykonuje się na wątku event loop sterownika, a kor żyje w Reactor Context, do którego listener nie ma dostępu.
  - Jak rozpoznać: reactor-tcp-*/parallel-* w nazwie wątku, kor=null w zdarzeniach sql
  - Wpływ: SQL nie daje się przypisać do requestu. Pomaga Hooks.enableAutomaticContextPropagation z ThreadLocalAccessor dla Diag.KOR, ale nie gwarantuje kontekstu w callbackach sterownika. Zostaje korelacja po czasie albo komentarz SQL z kor.
- Spring Boot z ręcznie zdefiniowanym @Bean ConnectionFactory ignoruje spring.r2dbc.url.
  - Jak rozpoznać: @Bean ConnectionFactory / ConnectionFactories.get(...) w kodzie
  - Wpływ: Proxy w URL nie działa. Trzeba BeanPostProcessor z ProxyConnectionFactory.builder(cf).
- Pula r2dbc-pool: kolejność r2dbc:pool:proxy:... vs r2dbc:proxy:pool:... zmienia, co jest mierzone (czas oczekiwania na połączenie).
  - Jak rozpoznać: r2dbc:pool w URL, spring.r2dbc.pool.*
  - Wpływ: Czasy SQL zawyżone albo zaniżone.

**Wyjścia HTTP: ClientHttpRequestInterceptor / RestClient / ExchangeFilterFunction / Feign / JAX-RS ClientRequestFilter**

- Customizery Boota działają tylko na klientach zbudowanych z auto-konfigurowanego buildera. new RestTemplate() albo RestClient.create() w kodzie je omija.
  - Jak rozpoznać: new RestTemplate(), RestClient.create(), WebClient.create() w kodzie
  - Wpływ: Brak wyjść HTTP w przebiegu. Zostaje agent albo logi klienta.
- WebClient i asynchroniczne klienty wykonują wywołanie na innym wątku (event loop), więc Diag.KOR jest null w filtrze, jeśli kontekst nie jest propagowany.
  - Jak rozpoznać: WebClient, CompletableFuture z HttpClient.sendAsync
  - Wpływ: Nagłówek korelacji bez wartości i osierocone zdarzenia.
- Feign RequestInterceptor nie widzi odpowiedzi ani czasu. Do pary call/ret trzeba własnego feign.Logger albo owinięcia feign.Client.
  - Jak rozpoznać: @FeignClient, implements RequestInterceptor
  - Wpływ: Jest tylko 'call', bez 'ret'.
- Retry i circuit breaker (Spring Retry, Resilience4j) mogą wysłać kilka requestów na jedno wywołanie albo żadnego (otwarty obwód).
  - Jak rozpoznać: @Retryable, @CircuitBreaker, RetryTemplate
  - Wpływ: Kilka par call/ret albo fallback bez wyjścia HTTP.

## Luki

### Wejścia

- Struts 2: nie zweryfikowałem w kodzie dokładnych komunikatów DEBUG (loggery org.apache.struts2.* / com.opensymphony.xwork2.*) dla wywołania akcji; format zależy od wersji. Komunikat Struts 1 RequestProcessor 'Processing a 'POST' for path' podany z pamięci, bez sprawdzenia w źródle.
- Nie sprawdziłem, czy agent OTel tworzy server span dla żądań MockMvc (MockHttpServletRequest przez MockFilterChain). Trzeba to sprawdzić eksperymentem.
- Nie zweryfikowałem dokładnych nazw server spanów nadpisywanych przez CxfServerSpanNaming / MetroServerSpanNameUpdater (czy to 'Service/operation', czy coś innego). Kod źródłowy zlokalizowany, nieodczytany.
- Nazwy atrybutów messaging zmieniały się między wersjami semconv (messaging.kafka.consumer.group → messaging.consumer.group.name, code.function → code.function.name, rpc.grpc.status_code → nowsze). Trzeba je przypiąć do wersji agenta w aplikacji testowej.
- Spring JMS observation (micrometer-jakarta9 DefaultJmsProcessObservationConvention): contextual name '<dest> process' podany z pamięci, nie sprawdzony w kodzie.
- Nie sprawdziłem: czy ThreadPoolTaskScheduler ma setTaskDecorator (dla MDC w @Scheduled) i od której wersji Springa.
- Timery EJB i @Asynchronous EJB: w agencie OTel nie ma modułu ejb. Nie badałem, czy serwery (WildFly, Payara, Liberty) mają własną telemetrię MicroProfile dla timerów.
- Micronaut: komunikat 'Matched route ...' z loggera io.micronaut.http.server (lub io.micronaut.web.router) nie został zweryfikowany w źródle.
- Spring Batch 5 / Spring Integration 6: wiem tylko, że agent ich nie wspiera ('not including 5.0+/6.0+ yet'). Nie sprawdziłem nazw obserwacji Micrometer, którymi je zastąpiono.
- Axon 5: API tracingu się zmienia. Nazwy spanów sprawdziłem tylko na gałęzi axon-4.10.x.

### Dostęp do danych

- Nie sprawdziłem w kodzie dokładnego formatu komunikatu Hibernate 6 'binding parameter (1:BIGINT) <- [42]' dla każdej wersji 6.x. Format zmieniał się między 6.0 a 6.2; regex wymaga testu na konkretnej wersji.
- Klucze logowania pgjdbc (loggerLevel deprecated, przejście na JUL 'org.postgresql') i dokładne formaty 'FE=> Parse/Bind' są podane z dokumentacji i pamięci, nie z kodu źródłowego aktualnej wersji.
- Nie potwierdziłem, czy instrumentacja Hibernate 6 w agencie 2.x jest wyłączona domyślnie dla wszystkich modułów (supported-libraries mówi 'disabled by default' dla Hibernate ogółem). Moduł MyBatis zweryfikowany w kodzie: defaultEnabled=false.
- Querydsl SQL: logowanie przez JUL na FINE (AbstractSQLQuery) zweryfikowane w kodzie. Nie sprawdziłem, czy nowsze wersje (OpenFeign querydsl 6.x) zmieniły logger.
- EclipseLink / OpenJPA: formaty komunikatów ('[EL Fine]: sql:', 'executing prepstmnt') podane z dokumentacji i doświadczenia, bez testu na konkretnej wersji serwera.
- Nie zbadałem szczegółowo Struts, JAX-WS ani Spring Integration JDBC (JdbcMessageStore, JdbcPollingChannelAdapter), choć też generują SQL. Spring Integration ma własne tabele INT_* i adaptery inbound/outbound z zapytaniem w XML.
- Nie zweryfikowałem dokładnych komunikatów logów Hibernate w trybie batch dla H6 (BatchingBatch zastąpiony przez BatchImpl / org.hibernate.orm.jdbc.batch). Nazwa loggera w H6 wymaga sprawdzenia.
- Brak weryfikacji formatu atrybutu z parametrami przy capture-query-parameters (prawdopodobnie db.query.parameter.<index>).

### Transakcje

- Nie zweryfikowałem w kodzie dokładnych komunikatów Spring Kafka DefaultKafkaProducerFactory (beginTransaction()/commitTransaction()) ani loggerów Atomikos — podane z dokumentacji/pamięci, wymagają potwierdzenia w aplikacji testowej.
- Nie sprawdziłem w kodzie loggera 'Flushed: N insertions...' dla Hibernate 7 (kategorie przeniesione do org.hibernate.orm.*); dla 6.x to org.hibernate.event.internal.AbstractFlushingEventListener.
- Nazwa klucza OTel dla atrybutów wątku (thread.name) zmieniała się między wersjami agenta — niezweryfikowana dla 2.2x.
- Spring Modulith: dokładne nazwy loggerów i komunikatów rejestru publikacji niesprawdzone w kodzie (podany pakiet org.springframework.modulith.events).
- Axon 5 (ProcessingContext zamiast UnitOfWork) nieopisany; Micronaut TransactionExecutionListener — sprawdzona obecność klasy, nie sposób rejestracji.
- Format def.toString w 'Creating new transaction' (sufiks "; ''" z qualifierem/labelem) potwierdzony z obserwacji logów, nie z kodu DefaultTransactionAttribute.
- WebSearch nie był używany intensywnie — źródłem był głównie kod frameworków (raw GitHub); limit GitHub API search wyczerpany w trakcie (Spring Batch sprawdzony przez raw).

### Logi

- Nie zweryfikowałem w kodzie domyślnej wartości otel.javaagent.add-thread-details ani tego, od której wersji agenta atrybuty thread.name/thread.id są na spanach; nazwy atrybutów DB (db.statement vs db.query.text) zależą od wersji konwencji semantycznych.
- Format nazwy spanu kontrolera Spring MVC z agenta OTel (np. 'OrderController.get') i klucz konfiguracji, który go włącza, różnią się między wersjami agenta. Nie sprawdzałem tego w źródle.
- Domyślny format konsoli Quarkus: dokumentacja dla bieżącej wersji podaje '%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p [%c] (%t) %s%e%n'. Wariant z '%c{3.}' i bez daty dla starszych wersji jest z pamięci, nie z repo.
- Wzorzec WildFly PATTERN/COLOR-PATTERN podaję z pamięci; ścieżki pliku logging.xml w repo wildfly nie zweryfikowałem (URL może nie istnieć).
- Nie sprawdziłem w źródle, czy Micronaut nie reinicjalizuje Logback, czyli czy -Dlogback.configurationFile działa we wszystkich wersjach.
- Konwerter Logback %micros (1.3+): nie potwierdziłem nazwy w dokumentacji.
- Nazwy wątków MDB 'Thread-N (ActiveMQ-client-global-threads)' i 'EJB default - N' potwierdzają wyniki wyszukiwania (zgłoszenia WildFly), ale nie przeczytałem ich w kodzie.
- Brak szczegółowych wpisów dla Struts 1/2, Spring Integration (logger org.springframework.integration.handler.LoggingHandler, wiretap), Querydsl i Quartz (logi org.quartz.core.JobRunShell) w kontekście logowania. Sygnały są tylko wspomniane, niezweryfikowane.
- Sposób włączenia Slf4jThreadLocalAccessor (io.micrometer.context.integration) do propagacji własnych kluczy MDC w ContextPropagatingTaskDecorator nie został sprawdzony w kodzie biblioteki context-propagation.
- Procesy wieloprocesowe w stylu PHP-FPM/gunicorn nie dotyczą JVM. Odpowiednikiem jest wiele instancji JVM lub węzłów klastra, opisane we wpisie o korelacji.

### Wstrzykiwanie

- Nie sprawdziłem w kodzie źródłowym dokładnych numerów wersji Byte Buddy dla Java 21/22. Streszczenie release notes było niespójne. Pewne: Java 25 od 1.17.5 (ASM 9.8), Java 26 od 1.17.8.
- Undertow access log: nie zweryfikowałem, czy %I to nazwa wątku w każdej wersji Undertow. Tomcat %I jest pewny.
- Spring Kafka interceptBeforeTx: nie sprawdziłem w źródłach dokładnej wersji ani domyślnej wartości.
- Axon 5: opisany tylko ogólnie (zmiana API na ProcessingContext). Nie sprawdzono dokładnych sygnatur.
- Wymaganej wersji aspectjweaver dla Java 23/24/25 nie sprawdziłem na tabeli JavaVersionCompatibility. Podane wersje są przybliżone.
- Nie przetestowałem żadnego wpisu na działającej aplikacji. Przypadki testowe to propozycje.
- Pominięte: JAX-WS Metro (dokładne logi transportu poza HttpAdapter.dump), WebLogic/WebSphere (odpowiednik jboss.modules.system.pkgs, np. WebSphere/OSGi bootdelegation), R2DBC (proxy r2dbc-proxy jako odpowiednik datasource-proxy w WebFlux).

## Przypadki testowe do napisania

### Wejścia

- **Spring Web MVC: @Controller/@RestController i inne HandlerMapping**: Aplikacja: UserApi (interfejs z @GetMapping("/users/{id}")), UserController implements UserApi, RouterFunction GET /health2, endpoint rzucający wyjątek, endpoint z DeferredResult. Wejście: GET /users/7, GET /users/7?x=1, GET /health2, GET /boom, GET /slow. Oczekiwane: 'GET "/users/7", parameters={}' → 'Mapped to ...UserController#get(Long)' → 'Completed 200 OK', span 'GET /users/{id}'; z ?x=1 'GET "/users/7?x=1", parameters={masked}'; dla /health2 'Mapped to' wskazuje lambdę; dla /boom '"ERROR" dispatch for GET "/error"' i 'Exiting from "ERROR" dispatch, status 500' scalone z pierwszym; dla /slow 'Exiting but response remains open...' a 'Completed' dopiero po ASYNC dispatch.
- **Servlet / Filter / web.xml / JSP i access log kontenera**: Aplikacja z @WebServlet("/legacy/*"), kontrolerem Spring, stroną /old.jsp i filtrem odrzucającym requesty bez X-Tenant. Wejście: 4 requesty z X-Request-Id=r1..r4 (jeden bez X-Tenant). Oczekiwane: access log zawiera r1..r4 z %D (w µs na Tomcat 10); request bez X-Tenant ma 400 i brak linii DispatcherServlet; r1 trafia do servletu bez Springa (span 'GET /legacy/*'); /old.jsp daje span 'Render /old.jsp' tylko na JSP 2.3.
- **Spring WebFlux: adnotacje + RouterFunction, log prefix wymiany**: Endpoint GET /orders/{id} zwracający Mono z publishOn(Schedulers.boundedElastic()) i logiem w handlerze; dwa równoległe wywołania. Oczekiwane: dwie pary '[id-1] HTTP GET "/orders/1"' / '[id-1] Completed 200 OK' z różnymi prefiksami; bez context-propagation log z handlera bez traceId; z nim i Micrometer Tracing — traceId poprawny, własny requestId tylko po rejestracji ThreadLocalAccessor.
- **JAX-RS (Jersey, RESTEasy, CXF, Quarkus REST)**: Jersey: @ApplicationPath("/api"), UsersResource @Path("users") z locatorem @Path("{id}/orders") zwracającym OrdersResource z @GET. Wejście: GET /api/users/7/orders. Oczekiwane: http.route '/api/users/{id}/orders', przebieg UsersResource.orders → OrdersResource.list; LoggingFeature (po jersey.config.server.logging.logger.level=INFO) '1 > GET .../api/users/7/orders' i '1 < 200'.
- **SOAP: JAX-WS (@WebService, CXF, Metro, Axis2) i Spring-WS (@Endpoint)**: CXF z operacjami placeOrder/cancelOrder pod /services/Orders i Spring-WS @Endpoint z @PayloadRoot(localPart="GetCustomerRequest"). Wejście: 3 wywołania SOAP. Oczekiwane: access log 3x POST na te same URL-e; spany CXF '/services/OrderService/placeOrder' i '.../cancelOrder'; Spring-WS span 'POST /ws' + MessageTracing.received; logger org.apache.cxf.services.<PortType>.REQ_IN z ExchangeId; przebiegi rozróżnione po operacji, nie po URL.
- **gRPC (grpc-java, grpc-spring-boot-starter, Spring gRPC, Quarkus)**: OrderService z rpc Place (unary) i rpc Watch (server streaming), globalny ServerInterceptor z MDC. Wejście: grpcurl -H 'x-request-id: g1' Place, potem Watch. Oczekiwane: przy starcie 'Registered gRPC service: acme.OrderService, ...'; span 'acme.OrderService/Place' i 'acme.OrderService/Watch'; log interceptora z g1; dla Watch wiele zdarzeń message w jednym spanie.
- **Konsumenci Kafka: @KafkaListener, kontenery programowe, Spring Cloud Stream, Kafka Streams**: @KafkaListener(topics="orders") z @RetryableTopic(attempts="3") rzucający wyjątek dla 'bad', plus Consumer<String> payments z SCSt. Wejście: 'ok' i 'bad' na orders, 'p1' na payments-topic. Oczekiwane: dla 'ok' jeden span 'orders process' (lub 'process orders' przy stable semconv); dla 'bad' spany 'orders process', 'orders-retry-0 process', ..., DltHandler na 'orders-dlt'; TRACE 'Processing orders-0@N'; payments wykryte statycznie tylko z application.yml.
- **JMS / RabbitMQ / MDB: listenery kolejek**: Spring Boot z @JmsListener(destination="orders.in") (Artemis embedded) oraz XML <rabbit:listener ref="pojo" method="onPayment" queues="payments">. Wejście: po jednej wiadomości, jedna z wyjątkiem. Oczekiwane: spany 'orders.in process' i 'payments process'; DEBUG 'Received message of type'; dla wyjątku 'Rolling back transaction because of listener exception thrown: ...' i drugi przebieg z JMSRedelivered=true.
- **Spring @Scheduled / TaskScheduler / XML task:scheduled-tasks**: @Scheduled(fixedRate=5000) ReportJob.generate oraz SchedulingConfigurer rejestrujący lambdę co 7 s. Oczekiwane: co wykonanie nowy trace; span 'ReportJob.generate' i span '...$$Lambda...run'; po otel.instrumentation.methods.include dla metody wywoływanej z lambdy — dodatkowy czytelny span; aspekt loguje ENTRY tylko dla @Scheduled.
- **Quartz i timery EJB**: SchedulerFactoryBean z RAMJobStore: ReportJob (QuartzJobBean) co 10 s oraz MethodInvokingJobDetailFactoryBean na CleanupService.purge. Oczekiwane: 'Calling execute on job DEFAULT.reportJob' i 'Calling execute on job DEFAULT.cleanupJob'; spany 'DEFAULT.reportJob' i 'DEFAULT.cleanupJob' z code.namespace = ...$MethodInvokingJob; narzędzie mapuje cleanupJob na CleanupService.purge z XML.
- **Spring Batch i wejścia CLI/startowe (main, CommandLineRunner, ApplicationRunner, picocli, zdarzenia startu)**: Aplikacja z CommandLineRunner (log + SELECT), @EventListener(ApplicationReadyEvent) i jobem Batch importJob z dwoma krokami, spring.batch.job.name=importJob. Wejście: java -jar app.jar date=2026-10-21. Oczekiwane: 'Started App' → runner → 'Job: [SimpleJob: [name=importJob]] launched with the following parameters: [{date=2026-10-21}]' → 'Executing step: [...]' x2 → 'completed ... status: [COMPLETED]'; nowy wiersz w BATCH_JOB_EXECUTION; na Batch 4 spany 'BatchJob importJob' dopiero po włączeniu instrumentacji.
- **Zdarzenia in-process: @EventListener, @TransactionalEventListener, @Async, CDI @Observes, Guava EventBus**: POST /orders → @Transactional serwis publikuje OrderPlaced; listenery: @EventListener (sync), @TransactionalEventListener (AFTER_COMMIT), @Async @EventListener; drugi endpoint publikuje to samo zdarzenie bez transakcji. Oczekiwane: kolejność sync → commit → AFTER_COMMIT, async na innym wątku; bez TaskDecorator async bez requestId; dla drugiego endpointu brak AFTER_COMMIT.
- **Axon: @CommandHandler, @EventHandler, @SagaEventHandler, @QueryHandler, @DeadlineHandler**: Agregat Order z @CommandHandler na konstruktorze (CreateOrderCommand), projekcja @EventHandler w @ProcessingGroup("orders") (tracking), saga na OrderCreatedEvent. Wejście: POST /orders → commandGateway.sendAndWait. Oczekiwane (LoggingSpanFactory): dispatchCommand → 'Handler span started ... [CreateOrderCommand]' w wątku http; potem w innym wątku 'StreamingEventProcessor.batch' → 'StreamingEventProcessor.process(OrderCreatedEvent)' x2; po resecie procesora drugi zestaw process bez wejścia HTTP.
- **Spring Integration: inbound adaptery/bramy, @ServiceActivator, @MessagingGateway**: Przepływ XML: int-http:inbound-gateway /orders → service-activator OrderService.handle → router → dwa kanały; plus file inbound adapter z pollerem co 2 s; message-history włączone. Wejście: POST /orders, wrzucenie pliku. Oczekiwane: nagłówek history z kolejnością komponentów; logi preSend dla każdego kanału; przebiegi pollera bez pliku puste.
- **Struts 1 / Struts 2: akcje z XML, wildcardy i Convention plugin**: Struts 2 z akcją XML order_* (list/save) i akcją Convention com.acme.action.InvoiceListAction. Wejście: GET /order_list.action, POST /order_save.action, GET /invoice-list. Oczekiwane: trzy wejścia z klasą#metodą rozwiązaną z XML, wildcarda i konwencji; server span 'GET /order_*' dla obu pierwszych; DEBUG 'Executing action method = list'/'= save'; przy controller-telemetry spany 'OrderAction.list', 'OrderAction.save', 'InvoiceListAction.execute'.
- **Micronaut i Quarkus: kontrolery, messaging, scheduler (przetwarzanie w czasie kompilacji)**: Quarkus: @Path("/users"), @Incoming("orders-in") z topic=orders, @Scheduled(every="10s"), @ConsumeEvent("greeting"). Wejście: GET /users/1, wiadomość na orders, odczekanie 10 s. Oczekiwane: access log z X-Request-Id; span HTTP i 'orders process'; przebieg schedulera; @ConsumeEvent jako krawędź in-process. Micronaut: TRACE RequestLifecycle 'Matched route GET - /users/1 to controller ...'.
- **Testy integracyjne jako wejścia (MockMvc, WebTestClient, TestRestTemplate, @SpringBootTest)**: GET /users/7 w trzech testach: @WebMvcTest z mockiem serwisu, @SpringBootTest + MockMvc, @SpringBootTest(RANDOM_PORT) + TestRestTemplate; plus test @Transactional zapisujący użytkownika. Oczekiwane: tylko RANDOM_PORT ma access log i span klienta+serwera; sprawdzić, czy MockMvc ma server span (hipoteza: tak, wątek testu); @WebMvcTest bez SQL; test transakcyjny bez COMMIT i bez INSERT bez flush; extension daje testId w każdej linii logu.
- **Identyfikator korelacji i znacznik wejścia: MDC, traceparent, nazwy kluczy w różnych stosach**: Ta sama aplikacja (a) bez agenta z filtrem MDC requestId, (b) z agentem OTel i wzorcem trace_id, (c) z Micrometer Tracing. Scenariusz: HTTP → @Async → Kafka producer → @KafkaListener. Oczekiwane: (a) requestId gubi się w @Async i w konsumencie; (b) jeden trace_id w HTTP, @Async i konsumencie; (c) traceId w HTTP, w konsumencie tylko przy spring.kafka.template.observation-enabled=true i spring.kafka.listener.observation-enabled=true, w @Async tylko z ContextPropagatingTaskDecorator.
- **JSF (FacesServlet, akcje managed beanów) i Spring Web Flow**: Widok orders.xhtml z przyciskami save i cancel (#{orderBean.save}, #{orderBean.cancel}) oraz pole z walidacją required. Wejście: kliknięcie save z pustym polem, save z danymi, cancel. Oczekiwane: trzy razy 'POST /orders.xhtml' w access logu; PhaseListener rozróżnia save/cancel; pierwszy przebieg bez wywołania OrderBean.save.
- **GraphQL (Spring for GraphQL, graphql-java, DGS)**: Schemat z query user(id) i mutation createOrder; @SchemaMapping orders na User. Wejście: query GetUser { user(id:7){ orders{id} } }, anonimowe '{ user(id:1){name} }', mutation CreateOrder. Oczekiwane: trzy razy 'POST /graphql'; spany 'query GetUser', 'query', 'mutation CreateOrder'; w pierwszym wiele wywołań resolvera orders.
- **WebSocket / STOMP (@MessageMapping) i SSE**: STOMP endpoint /ws, @MessageMapping("/orders") i @SubscribeMapping("/topic/orders"). Wejście: połączenie, 3 wysyłki SEND /app/orders. Oczekiwane: jeden 'GET /ws' (101) w access logu; interceptor loguje 3 wejścia z tym samym sessionId; brak spanów per wiadomość z agenta.
- **Zdalne wywołania legacy: RMI, EJB @Remote, Spring Remoting (HttpInvoker/Hessian/Burlap)**: Usługa RMI OrderService z metodami place/cancel i ten sam interfejs wyeksportowany HttpInvokerem (Spring 5.3). Wejście: po jednym wywołaniu każdej metody każdym kanałem. Oczekiwane: spany 'acme.OrderService/place' i '/cancel' dla RMI; dla HttpInvokera dwa razy 'POST /remoting/OrderService' bez nazwy metody; logCalls loguje oba wywołania RMI.
- **Apache Camel: trasy from(...) jako wejścia**: Camel Spring Boot z trasą from("jms:queue:orders").bean(OrderService.class,"handle").to("direct:audit") i from("timer:cleanup?period=5000"). Włączone use-mdc-logging i tracing. Wejście: jedna wiadomość na orders. Oczekiwane: przy starcie lista 2 tras; Tracer z jednym exchangeId przez OrderService.handle i direct:audit; timer co 5 s jako osobne przebiegi.

### Dostęp do danych

- **Statyczne rozpoznanie warstwy danych (nie tylko *Repository)**: Aplikacja z czterema wariantami: JpaRepository, *Repository opakowującym RestTemplate, @Service z JdbcTemplate wstrzykniętym wprost oraz encja Panache. Oczekiwany wynik: klasyfikator oznacza trzy z nich jako dostęp do bazy, a wariant REST jako zasób zewnętrzny, choć nazwy sugerują coś innego.
- **Spring Data: zapytania pochodne, @Query, nazwane, Specification, Querydsl**: OrderRepository z metodami findByStatus(String, Pageable), @Query nativeQuery, deleteByCustomerId i zapytaniem nazwanym z orm.xml. Wywołanie każdej z nich przez endpoint i porównanie: statycznie przewidziany SQL kontra org.hibernate.SQL. Oczekiwane: deleteByCustomerId daje 1 SELECT i N DELETE, findByStatus daje SELECT i COUNT.
- **Hibernate: logowanie SQL i parametrów (3.x, 4/5, 6.0–6.2, 6.3+)**: Endpoint GET /orders/{id} na Spring Boot 3.3+ (H6.5+), 3.0 (H6.1) i 2.7 (H5.6). Dla każdego: włączyć org.hibernate.SQL=DEBUG i odpowiedni binder, parser ma złożyć pełny SQL z parametrami i dopasować go do requestu po traceId z MDC. Oczekiwane: na 2.7 i 3.0 działa regex 'as [TYPE] - [v]' (różne loggery), na 3.3+ regex '(n:TYPE) <- [v]'.
- **Hibernate: SQL bez wywołania repozytorium (flush, dirty checking, kaskady, write-behind, Envers)**: Serwis @Transactional: order = repo.findById(1); order.setStatus(CLOSED); order.getItems().remove(0); return. Oczekiwane: SELECT orders, SELECT items (lazy), a dopiero po 'Committing JPA transaction on EntityManager' UPDATE orders i DELETE order_item (orphanRemoval), choć w kodzie nie ma save ani delete.
- **Lazy loading, N+1 i open-in-view: SQL poza warstwą danych**: GET /customers zwraca List<Customer> (encje) z lazy @OneToMany orders. Przy OSIV=true: 1 SELECT customers i N SELECT orders wykonane podczas serializacji Jacksona, co p6spy stacktrace pokazuje jako com.fasterxml.jackson... -> PersistentBag. Przy OSIV=false: LazyInitializationException. Ten test sprawdza, czy flow-lens przypisze SQL do warstwy web.
- **Spring JdbcTemplate / NamedParameterJdbcTemplate / JdbcClient / SimpleJdbcCall**: Repozytorium JDBC z trzema metodami: jdbcTemplate.queryForObject("select ... where id=?", ...), namedJdbc.update(":a"), new SimpleJdbcCall(ds).withProcedureName("close_order").execute(...). Oczekiwane linie DEBUG: 'Executing prepared SQL query' + 'Executing prepared SQL statement [select ... where id=?]' z TRACE parametru, 'Executing prepared SQL update' + statement z ? zamiast :a oraz 'Calling stored procedure [{call close_order(?)}]'.
- **MyBatis (i iBATIS 2): mappery XML/adnotacje, dynamiczny SQL, logi per statement**: OrderMapper.xml z <select id="search"> zawierającym <if test="status != null"> i <foreach> po ids, wywołany raz z status i raz bez. Oczekiwane: dwa różne '==>  Preparing:' pod loggerem com.x.OrderMapper.search, a statycznie oba warianty SQL wyprowadzone z XML.
- **jOOQ i Querydsl SQL: query buildery**: Serwis z ctx.selectFrom(ORDERS).where(ORDERS.STATUS.eq("OPEN")).fetch() i ctx.batch(insert...).execute(). Oczekiwane: pary linii 'Executing query' / '-> with bind values' oraz 'Executing batch query' i 'Batch size : N' pod loggerem org.jooq.tools.LoggerListener.
- **Proxy sterownika/DataSource: p6spy, datasource-proxy, log4jdbc, WildFly spy**: Ta sama aplikacja (Hibernate, JdbcTemplate i czysty JDBC w jednym requeście) uruchomiona z p6spy-spring-boot-starter i stacktrace=true. Oczekiwane: komplet SQL ze wszystkich trzech dróg w jednym formacie, z connectionId i klasą wywołującą. Parser flow-lens grupuje linie po traceId z MDC.
- **OpenTelemetry: spany JDBC i semconv bazodanowy**: Uruchomić agenta 2.2x z otel.semconv-stability.opt-in=database/dup i capture-query-parameters=true. Endpoint wywołuje repo.findById, jdbcTemplate.batchUpdate (3 wiersze) i SimpleJdbcCall. Oczekiwane: 'Session.find ...' (instrumentacja hibernate domyślnie włączona) z dzieckiem 'SELECT ...orders', span 'BATCH INSERT ...' z db.operation.batch.size=3 oraz span CALL z db.stored_procedure.name; parametry jako db.query.parameter.*.
- **Procedury składowane, funkcje, triggery i widoki: logika po stronie bazy**: Procedura close_order(id) aktualizuje orders i wstawia audit (trigger na orders wstawia też do history). Wywołanie przez @Procedure. Oczekiwane: aplikacja i OTel pokazują 1 wywołanie CALL, a pg_stat_statements.track=all pokazuje UPDATE orders, INSERT audit i INSERT history. flow-lens powinien statycznie dociągnąć te 3 tabele z migracji.
- **Batch: JDBC addBatch, Hibernate jdbc.batch_size, przepisywanie przez sterownik**: Zapis 100 encji przez saveAll przy batch_size=50, raz z SEQUENCE i raz z IDENTITY. Oczekiwane: z SEQUENCE 2 batche ('BATCH INSERT', batch.size=50) plus SELECTy nextval (albo mniej przy pooled optimizer), z IDENTITY 100 osobnych INSERTów.
- **Log po stronie bazy i korelacja z requestem**: PostgreSQL w Dockerze z log_statement=all, log_line_prefix z %a i %p, aplikacja z ApplicationName=flowlens i StatementInspectorem doklejającym traceId. Oczekiwane: każda linia 'execute <unnamed>:' / 'execute S_n:' w logu bazy zawiera '/* req=... */' równy traceId z MDC w logu aplikacji.
- **Logowanie na poziomie sterownika JDBC**: Czysty JDBC (DriverManager + PreparedStatement) bez Springa, z pgjdbc 42.x i logging.properties org.postgresql.level=FINEST. Oczekiwane: komunikaty FE=> Parse i FE=> Bind z tekstem SQL i wartościami, możliwe do sparsowania regexem 'FE=> Parse\(stmt=.*?,query="(.*?)"'.
- **Java EE / Jakarta EE: JPA w kontenerze (EclipseLink, OpenJPA, Hibernate w WildFly), EJB/JTA, JNDI DataSource**: Bean @Stateless z @PersistenceContext uruchomiony na Payara (EclipseLink) i na WildFly (Hibernate), z tymi samymi encjami i metodą. Oczekiwane: dwa różne formaty logów ('[EL Fine]: sql:' kontra org.hibernate.SQL), a parser flow-lens rozpoznaje dostawcę z persistence.xml lub serwera i wybiera właściwy regex.
- **Spring 2.5–4 z XML i stare szablony DAO (HibernateTemplate, JdbcDaoSupport, transakcje AOP w XML)**: Aplikacja Spring 3.2 + Hibernate 3.6 z OrderDaoImpl extends HibernateDaoSupport, zdefiniowana w XML, i serwis objęty tx:advice 'save*'. Oczekiwane: flow-lens z samego XML i kodu wyznacza OrderService.saveOrder -> OrderDaoImpl.save -> INSERT orders i oznacza transakcję REQUIRED; parametry parsowane regexem H3.6.
- **Reaktywny dostęp do danych (R2DBC, Hibernate Reactive, Vert.x SQL) i Micronaut Data**: WebFlux z ReactiveCrudRepository: GET /orders/{id} -> repo.findById(id).flatMap(o -> itemsRepo.findByOrderId(o.id).collectList()). Oczekiwane: dwa 'Executing SQL statement' pod org.springframework.r2dbc.core i dwa spany r2dbc z tym samym traceId. Bez context-propagation MDC jest puste.
- **Aplikacje bez bazy relacyjnej lub z bazą 'obok' (NoSQL, cache, pliki, zdalne API)**: Aplikacja z OrderRepository extends CrudRepository<Order,String>, gdzie Order ma @Document, a na classpath są H2 i spring-data-mongodb. Oczekiwane: flow-lens klasyfikuje dostęp jako MongoDB (find orders), a nie SQL, mimo działającego Hikari na H2.
- **Przypisanie SQL do metody i requestu: granice transakcji i MDC jako szkielet**: OrderService.place (@Transactional) wywołuje AuditService.log (@Transactional(REQUIRES_NEW)) oraz this.recalc() (@Transactional(REQUIRES_NEW), self-invocation). Oczekiwane w logach (tryb PROXY): 'Suspending current transaction' tylko dla AuditService.log, SQL recalc w transakcji place, a wszystkie SQL z tym samym flow.id w MDC.
- **SQL infrastruktury frameworków (Spring Batch, Quartz, Spring Session JDBC, Spring Integration JDBC, ShedLock, Flyway/Liquibase)**: Aplikacja ze Spring Session JDBC i jobem @Scheduled z @SchedulerLock. GET /orders/1: oczekiwane SELECT orders w kontrolerze/serwisie oraz po nim UPDATE SPRING_SESSION oznaczony jako infrastruktura; co minutę UPDATE shedlock poza jakimkolwiek requestem.
- **EJB 2.x CMP/BMP i J2EE sprzed JPA**: Aplikacja J2EE na JBoss 4 z encją CMP Order i finderem findByStatus (EJB-QL) wywołanym z session beana. Oczekiwane: flow-lens wyprowadza tabelę i SQL z ejb-jar.xml + jbosscmp-jdbc.xml, a log bazy potwierdza 1+N SELECT oraz UPDATE przy commit.
- **Inne mappery i ORM spotykane w legacy: Jdbi, Ebean, Commons DbUtils, Cayenne, natywne API Hibernate**: Moduł z Jdbi 3 SQL Object (@SqlQuery) i DAO z QueryRunner. Oczekiwane: bez SqlLoggera log Jdbi pusty, z Slf4JSqlLogger linia 'Executed in ...' pod org.jdbi.sql; DbUtils widoczny wyłącznie w p6spy.

### Transakcje

- **Spring AbstractPlatformTransactionManager: granice tx w logach DEBUG (begin/join/suspend/nested/commit/rollback)**: OrderService.place() @Transactional → AuditService.log() @Transactional(REQUIRES_NEW) i PaymentService.charge() @Transactional(NESTED) przez JdbcTemplate (DataSourceTransactionManager, nestedTransactionAllowed=true domyślnie). Oczekiwane: Creating new [OrderService.place] → Suspending current transaction, creating new [AuditService.log] → Initiating transaction commit → Committing JDBC transaction → Releasing JDBC Connection → Resuming suspended → Creating nested [PaymentService.charge] → Releasing transaction savepoint → Initiating transaction commit. Wariant: charge rzuca, place łapie → 'Rolling back transaction to savepoint' i commit zewnętrznej. Wariant z @Transactional("inny") na drugim DS → osobny ciąg logów.
- **Spring @Transactional przez proxy (TransactionInterceptor) — deklaratywne granice i TRACE per metoda**: Kontroler → OrderService.place() (@Transactional) → OrderRepository.save() (Spring Data). Z TRACE oczekiwane: Getting transaction for [OrderService.place] → Getting transaction for [org.springframework.data.jpa.repository.support.SimpleJpaRepository.save] → Completing ...save → Completing ...place; w DEBUG JpaTransactionManager jedno 'Creating new transaction' i 'Participating in existing transaction' dla save. Przy starcie (annotation=TRACE): 'Adding transactional method 'OrderService.place' with attribute: PROPAGATION_REQUIRED,ISOLATION_DEFAULT'.
- **Self-invocation, metody private/final/static — @Transactional pomijany przez proxy (Spring, EJB); inaczej w Quarkus i Micronaut**: Spring: OrderService.place() bez @Transactional woła this.saveAll() z @Transactional, które zapisuje 2 encje przez repo i rzuca po pierwszej. Oczekiwane: brak 'Getting transaction for [..saveAll]'; pierwsza encja zostaje w bazie (każde save to tx repozytorium). Wariant z @Lazy self-proxy: rollback obu. Kontrola: ten sam kod w Quarkus → rollback obu (self-interception).
- **Reguły rollbacku: checked exceptions, łapanie wyjątków, setRollbackOnly, timeout**: Metoda @Transactional zapisuje encję i rzuca IOException (checked). Oczekiwane: 'after exception: java.io.IOException' → 'Initiating transaction commit', wiersz w bazie, HTTP 500. Wariant rollbackFor=IOException.class → rollback; wariant catch+setRollbackOnly → 'Transactional code has requested rollback', HTTP 200 i brak wiersza; wariant rollbackForClassName="IO" → rollback także dla UncheckedIOException (podciąg).
- **Transakcje programowe: TransactionTemplate, PlatformTransactionManager, TransactionalOperator, UserTransaction, QuarkusTransaction, jOOQ, czysty JDBC**: Serwis z TransactionTemplate (REQUIRES_NEW, setName("retryLog")) w środku metody @Transactional. Oczekiwane: 'Suspending current transaction, creating new transaction with name [retryLog]'. Wariant czystego JDBC z setAutoCommit(false) + p6spy: linie statement..., commit; z agentem i flagą transaction — span COMMIT.
- **Transakcje niejawne: autocommit, transakcje na poziomie repozytorium Spring Data, JdbcTemplate/MyBatis bez tx, efekty po stronie bazy**: Kontroler bez @Transactional woła jdbcTemplate.update x2 i orderRepository.save. Oczekiwane: dwa 'Fetching JDBC Connection from DataSource' bez tx i jedno 'Creating new transaction with name [org.springframework.data.jpa.repository.support.SimpleJpaRepository.save]'. Błąd po pierwszym update zostawia go w bazie. Wariant: @Modifying @Query bez @Transactional → TransactionRequiredException.
- **Kod JDBC poza transakcją Springa mimo @Transactional: surowy DataSource, TransactionAwareDataSourceProxy, LazyConnectionDataSourceProxy**: @Transactional metoda: orderRepository.save(o) (JPA) + legacyDao.insertAudit() używające dataSource.getConnection(); potem RuntimeException. Oczekiwane: rollback Order, audit zostaje w bazie; DataSourceUtils/Hikari pokazują drugie połączenie. Wariant z TransactionAwareDataSourceProxy wstrzykniętym do DAO: rollback obu.
- **Hibernate/JPA: flush, dirty checking i przesunięcie SQL na granicę commit**: @Transactional changeEmail(id): find → user.setEmail(x), bez save. Oczekiwane: SELECT w trakcie metody; 'Initiating transaction commit' → 'Committing JPA transaction on EntityManager' → UPDATE → 'Flushed: 0 insertions, 1 updates, 0 deletions to 1 objects'; OTel: UPDATE jako dziecko 'Transaction.commit'.
- **readOnly: co faktycznie robi i gdzie jest ignorowane**: @Transactional(readOnly=true) report() wywołuje userService.touch() z @Transactional (REQUIRED) zmieniające encję. Oczekiwane: jedna tx z ',readOnly', 'Participating in existing transaction', brak UPDATE. Wariant touch() z REQUIRES_NEW → UPDATE w osobnej tx. Wariant z validateExistingTransaction=true → IllegalTransactionStateException.
- **NESTED / savepoint i REQUIRES_NEW — wsparcie zależne od menedżera**: Pula Hikari maximumPoolSize=2, 2 równoległe requesty, każdy @Transactional woła metodę REQUIRES_NEW. Oczekiwane: oba czekają, po connectionTimeout SQLTransientConnectionException. Drugi test: NESTED z JpaTransactionManager wywołane z @Transactional → NestedTransactionNotSupportedException; wywołane bez zewnętrznej tx → 'Creating new transaction'.
- **Lazy loading poza transakcją, Open Session/EntityManager In View**: GET /orders/{id} zwraca encję Order z lazy items. open-in-view=true: SELECT order w tx, SELECT items po commit podczas serializacji. open-in-view=false: HttpMessageNotWritableException z LazyInitializationException (tekst zależny od wersji Hibernate).
- **Wątki i async gubią transakcję (@Async, executory, reactive, coroutines, Spring Integration channels, EJB @Asynchronous)**: @Transactional create() zapisuje Order i woła notifier.sendAsync(orderId) (@Async @Transactional(readOnly=true)) robiący findById. Oczekiwane: dwa wątki, dwie tx, w async często Optional.empty(). Wariant z @TransactionalEventListener(AFTER_COMMIT)+@Async: zawsze znajduje.
- **@TransactionalEventListener / TransactionSynchronization — kod po commit, po rollback, przed commit**: OrderService.place() @Transactional publikuje OrderPlaced; listener AFTER_COMMIT zapisuje AuditLog (A: JPA bez @Transactional, B: REQUIRES_NEW, C: JdbcTemplate bez adnotacji), listener AFTER_ROLLBACK loguje. Oczekiwane: A — brak wiersza, B — osobne 'Creating new transaction', C — sprawdzić (setAutoCommit(true)). Listener rzucający wyjątek → HTTP 200 i ERROR afterCompletion. publishEvent bez tx → 'No transaction is active - skipping'.
- **Java EE / Jakarta EE: CMT (EJB), BMT, Jakarta @Transactional, MDB — granice i logi Narayana**: JAX-RS @Path na @Stateless OrderResource → @EJB InventoryBean.reserve() (@TransactionAttribute(REQUIRES_NEW)) → rzuca RuntimeException. Oczekiwane (TRACE com.arjuna): BaseTransaction.begin (zewnętrzna), begin (wewnętrzna), rollback wewnętrznej, EJBException w zasobie → rollback zewnętrznej; z @ApplicationException(rollback=false) na wyjątku checked → commit obu.
- **Transakcje rozproszone JTA/XA i Spring JtaTransactionManager (Atomikos, Narayana, Bitronix) vs best-effort 1PC**: Spring Boot + narayana-spring-boot-starter, 2 XADataSource (orders, billing) + JMS; jedna metoda @Transactional zapisuje do obu i wysyła wiadomość. Oczekiwane TRACE: 3x enlistResource, faza prepare, potem commit drugiej fazy. Wariant z jednym zasobem: commit jednofazowy.
- **Transakcje w listenerach komunikatów: Kafka, RabbitMQ, JMS DefaultMessageListenerContainer**: @KafkaListener zapisuje Payment (JPA) i wysyła PaymentDone; A bez Kafka TM, B z transaction-id-prefix i kafkaAwareTransactionManager. Wyjątek po send: A — PaymentDone widoczne dla konsumenta (także read_committed, bo producent nietransakcyjny), DB rollback; B — 'abortTransaction()', konsument read_committed nic nie widzi, konsument read_uncommitted widzi.
- **Outbox: atomowość zapisu domeny i publikacji (Spring Modulith, Debezium, własna tabela)**: OrderService.place() @Transactional zapisuje Order i publikuje OrderPlaced; moduł Shipping ma @ApplicationModuleListener. Oczekiwane: INSERT orders + INSERT event_publication w jednej tx, po commit nowy wątek i 'Creating new transaction' dla listenera, UPDATE event_publication SET completion_date. Wyjątek w listenerze → completion_date null.
- **Batch i harmonogramy: Spring Batch chunk, @Scheduled, Quartz — transakcja per chunk/job, a nie per request**: Job z chunk(10) na 25 rekordach, writer rzuca na rekordzie 17 z skip(MyEx). Oczekiwane: commit po 10, rollback chunku 11–20 ('Rollback for RuntimeException'), ponowne przetwarzanie 11–20 po jednym (osobne tx, 17 pominięty), commit 21–25.
- **Spring 2.x/3.x/4.x XML: tx:advice + aop:pointcut, TransactionProxyFactoryBean, Struts + OpenSessionInView**: XML z tx:method get* readOnly i * REQUIRED na execution(* com.x.service.*.*(..)); Struts Action woła service.getOrder(), service.updateOrder() i dao.audit() (DAO poza pointcutem). Oczekiwane: dwie osobne tx (readOnly i zapis), audit w autocommit; przy starcie 'Adding transactional method [get*]'. Wariant: service.getAndMark() zmieniające encję → brak UPDATE.
- **OpenTelemetry Java agent: co realnie widać z transakcji (JDBC COMMIT/ROLLBACK, Hibernate Transaction.commit, methods include)**: Aplikacja z agentem i flagą transaction.enabled: endpoint @Transactional z 2 INSERT (JdbcTemplate), endpoint bez tx z 2 jdbcTemplate.update, endpoint z rollbackiem. Oczekiwane: [INSERT, INSERT, COMMIT]; [UPDATE, UPDATE] bez COMMIT; [INSERT, ROLLBACK]. Z JPA: 'Transaction.commit' z dziećmi INSERT i COMMIT. Sprawdzić nazwę spanu i atrybuty COMMIT w danej wersji agenta.
- **Transakcje w testach: Spring TestContext (@Transactional na teście), MockMvc vs serwer na porcie**: Ten sam scenariusz place-order w dwóch testach: A @SpringBootTest + @Transactional + MockMvc, B @SpringBootTest(RANDOM_PORT) bez @Transactional. Oczekiwane: A — 'Began transaction (1) for test context', serwis 'Participating', brak UPDATE i brak listenera AFTER_COMMIT, 'Rolled back transaction for test'; B — 'Creating new transaction' w wątku http-nio-*, commit, listener odpala.
- **Axon, Micronaut, Quarkus: inne miejsca startu transakcji**: Axon + Spring Boot JPA: komenda PlaceOrder → agregat apply OrderPlaced → tracking processor projekcji z batchSize=5; wysłać 7 komend. Oczekiwane: 7 tx komend ('Creating new transaction with name [null]'), 2 tx projekcji (5 i 2 zdarzenia) z UPDATE token_entry w każdej. Quarkus: @Transactional metoda zwracająca Uni z opóźnieniem — commit po zakończeniu Uni.

### Logi

- **Domyślny wzorzec logów Spring Boot (Logback/Log4j2) i obcinanie nazwy wątku**: GET /orders/1 w Boot 3, raz z konsolą, raz z logging.file.name=app.log. Oczekiwane: na konsoli '[nio-8080-exec-1]', w pliku '[http-nio-8080-exec-1]'. Parser rozpoznaje oba warianty jako ten sam wątek, a exec-1 i exec-11 jako różne. Dodatkowo dwa @KafkaListener z id 'orders-listener' i 'payments-listener': na konsoli identyczne '[-listener-0-C-1]', w pliku rozróżnione.
- **Correlation ID w Spring Boot 3.2+ (Micrometer Tracing, logging.pattern.correlation) i Sleuth w Boot 1.x/2.x**: Boot 3.3 + micrometer-tracing-bridge-brave: GET /orders/1 wywołujący @Async i @Scheduled. Oczekiwane: linie kontrolera i repozytorium z tym samym traceId; linia z @Async z pustym blokiem (bez dekoratora) albo z tym samym traceId (z dekoratorem); @Scheduled z pustym blokiem (bez observation) albo nowym traceId.
- **Agent OpenTelemetry Java: wstrzykiwanie trace_id/span_id do MDC (logback-mdc, log4j-context-data, log4j-mdc-1.2, jboss-logmanager-mdc)**: Aplikacja Boot bez Micrometer Tracing, z agentem OTel, bez zmiany wzorca: oczekiwany brak id w logu. Po ustawieniu trace-id-key=traceId, span-id-key=spanId i logging.pattern.correlation=%correlationId blok '[trace-span]' zawiera id agenta zgodne z trace_id eksportowanego spanu 'GET /orders/{id}'. W kodzie aplikacji MDC.get("traceId") nadal zwraca null.
- **Logi strukturalne JSON: Spring Boot 3.4+ (ecs/logstash/gelf), logstash-logback-encoder, Log4j2 JsonTemplateLayout, Quarkus JSON**: Boot 3.4 i 3.5 z logging.structured.format.console=ecs: GET /orders/1. Oczekiwane: parser odczytuje w obu wersjach process.thread.name='http-nio-8080-exec-1' (bez obcinania, bo JSON nie stosuje %15.15t) i trace.id, jeśli jest tracing, mimo innego kształtu JSON.
- **MDC/ThreadContext a pule wątków, @Async, CompletableFuture (utrata i wyciek kontekstu)**: Filtr ustawia MDC requestId; kontroler wywołuje @Async i CompletableFuture.supplyAsync. Przebiegi: (a) bez dekoratora: linie w 'task-1' i 'ForkJoinPool.commonPool-worker-1' bez requestId; (b) z ContextPropagatingTaskDecorator: traceId jest, własny requestId nie; (b2) plus Slf4jThreadLocalAccessor("requestId"): requestId też jest; (c) filtr bez clear() + 2 żądania sekwencyjnie przy maxThreads=1: drugie żądanie ma requestId pierwszego w liniach przed MDC.put.
- **WebFlux/Reactor: log prefix '[<id>] ' zamiast wątku i spring.reactor.context-propagation**: WebFlux endpoint z delayElement(100ms) i WebClient do drugiego serwisu, 20 równoległych żądań. Oczekiwane: logi frameworka rozdzielone po logId (globalnie rosnący sufiks); log.info z handlera bez logId i bez traceId (bez context-propagation), po włączeniu 'auto' z traceId.
- **Nazwy wątków jako sygnał typu wejścia (Tomcat, Jetty, Undertow/WildFly, Netty, Kafka, Rabbit, @Scheduled, Quartz, wirtualne wątki)**: Jedna aplikacja z endpointem HTTP, @KafkaListener (concurrency=2), @RabbitListener (simple i direct), @Scheduled i jobem Quartz. Oczekiwane: klasyfikator po nazwie wątku przypisuje każdą linię do właściwego typu wejścia (direct Rabbit oznaczony jako niepewny); po spring.threads.virtual.enabled=true wątki HTTP to 'tomcat-handler-N'.
- **Asynchroniczne appendery: utrata zdarzeń, brak caller data, nazwa wątku z cache**: Logback z AsyncAppender (queueSize=16) i logging.level.org.hibernate.SQL=DEBUG; 200 równoległych żądań. Oczekiwane: części linii 'org.hibernate.SQL' brakuje, a WARN są wszystkie; nasz synchroniczny plik diagnostyczny ma komplet.
- **Kierowanie NASZYCH logów diagnostycznych do osobnego pliku**: Boot z własnym logback-spring.xml i AsyncAppenderem. Uruchomić agenta (wariant A) i osobno wariant B z logging.config. Oczekiwane: app.log bez żadnej linii flowlens, a flowlens-<host>-<pid>.jsonl z kompletem zdarzeń enter/exit dla GET /orders/1 przy 200 równoległych żądaniach.
- **Logi SQL i transakcji jako kroki przebiegu (Hibernate, JdbcTemplate, Spring TX, MyBatis, jOOQ)**: OrderService.place() @Transactional wywołuje REQUIRES_NEW AuditService.log() i zmienia encję bez save(). Oczekiwane w logu: 'Creating new transaction with name [..OrderService.place]', 'Suspending current transaction, creating new transaction with name [..AuditService.log]', INSERT audytu, 'Resuming suspended transaction after completion of inner transaction', a UPDATE order dopiero po 'Initiating transaction commit'.
- **Logi wejścia HTTP w Spring MVC: DispatcherServlet, 'Mapped to', CommonsRequestLoggingFilter (Spring 4.x i 5.1+)**: GET /orders/1 i POST /orders z logging.level.web=DEBUG w Boot 3 i w Boot 1.5. Oczekiwane: w Boot 3 trójka 'GET "/orders/1"' -> 'Mapped to ...OrderController#get(Long)' -> 'Completed 200 OK' w jednym wątku http-nio-*-exec-N; w Boot 1.5 'processing GET request for [/orders/1]' -> 'Returning handler method [...]' -> 'Successfully completed request'; dla DeferredResult 'Completed' w innym wątku.
- **Access log Tomcata/Undertow/Quarkus jako kotwica requestu (%I wątek, %D czas, nagłówki id)**: 20 równoległych GET /orders/{i} z różnym czasem odpowiedzi. Oczekiwane: dla każdego wpisu access logu linie aplikacji z tym samym wątkiem w oknie [start, start+ms] należą do tego samego i (sprawdzić na parametrze w SQL).
- **Java EE / Jakarta EE (WildFly, JBoss EAP): format JBoss LogManager, EJB, JTA, MDB**: WAR na WildFly: JAX-RS POST /orders -> @Stateless OrderBean -> wysyła JMS -> @MessageDriven OrderListener zapisuje do DB. Oczekiwane: parser rozpoznaje dwa typy wątków (default task-N i Thread-N (ActiveMQ-client-global-threads)), a łączy je dopiero nasze zdarzenie 'send(JMSMessageID)' / 'onMessage(JMSMessageID)'.
- **Quarkus i Micronaut: JBoss LogManager, Vert.x duplicated context, MdcPropagationContext**: Quarkus: endpoint blokujący i endpoint reaktywny (Uni) z log.info i SQL, 20 równoległych żądań. Oczekiwane: blokujący (executor-thread-N) da się korelować po wątku; reaktywny wymaga traceId z quarkus-opentelemetry.
- **Identyfikatory 'korelacji' w messagingu, które NIE są trace id (Axon traceId/correlationId, JMSCorrelationID, Spring Integration, Kafka headers)**: REST -> CommandGateway.send(PlaceOrder) -> @CommandHandler emituje OrderPlaced -> @EventHandler w tracking processorze zapisuje projekcję. Oczekiwane: correlationId w OrderPlaced = id PlaceOrder, traceId jednakowy w obu (= id PlaceOrder, jeśli to pierwszy komunikat); wątek handlera zdarzeń inny niż HTTP.
- **JAX-WS/SOAP (Apache CXF LoggingFeature): ExchangeId w MDC tylko na czas jednej linii**: Endpoint SOAP placeOrder z LoggingFeature wywołujący JdbcTemplate. Oczekiwane: REQ_IN i RESP_OUT z tym samym ExchangeId, a SQL pomiędzy nimi na tym samym wątku bez ExchangeId. Wariant: filtr ustawia MDC 'MessageId'; po REQ_IN klucz znika.
- **Korelacja linii bez id (wątek + czas) i gdzie zawodzi; wiele instancji JVM**: Ta sama aplikacja w dwóch wariantach: Tomcat maxThreads=2 z 50 równoległymi żądaniami vs WebFlux. Oczekiwane: segmentacja wątek+czas dla Tomcata daje 100% zgodności z naszym request id; dla WebFlux zgodność wyraźnie poniżej 100%, a kontrola jakości (2) wykrywa przeploty.
- **Routing logów w legacy: JCL, Log4j 1.x, JUL, mosty SLF4J i pliki Tomcata (gdzie naprawdę trafia linia)**: WAR na samodzielnym Tomcacie z Spring 4 + Log4j 1 + Hibernate, kontroler rzucający wyjątek. Oczekiwane: logi Springa w pliku Log4j, stack trace wyjątku w localhost.<data>.log ('Servlet.service() for servlet ... threw exception'), 'Hibernate:' w catalina.out; po dodaniu jcl-over-slf4j + logback wszystkie poza catalina.out w jednym pliku.
- **Wejścia batch i job w logach: Spring Batch, Quartz, Spring @Scheduled**: Aplikacja z jobem Spring Batch (2 kroki, drugi partycjonowany), jobem Quartz i @Scheduled co 5 s, każdy zapisuje do DB. Oczekiwane: parser wyznacza granice Batch i Quartz z logów (Quartz po włączeniu DEBUG), a dla @Scheduled tylko z naszych zdarzeń agenta.

### Wstrzykiwanie

- **Pomocnik Diag: zapis JSONL do osobnego pliku (wspólny dla wszystkich punktów wstrzyknięcia)**: Test jednostkowy: 2 wątki platformowe i 2 wirtualne po 1000 zdarzeń. Każda linia musi się parsować jako JSON, sek musi być unikalne i rosnące, kor z wątku A nie może się pojawić w liniach wątku B. Drugi test: Diag załadowany przez dwa URLClassLoadery. Detektor powinien wykryć powtórzone wartości sek.
- **Własny Java agent (java.lang.instrument + Byte Buddy Advice), bez zmian w kodzie**: Aplikacja Spring Boot 3 + JPA: GET /orders/1 -> OrderController.get -> OrderService.find (@Transactional) -> OrderRepository.findById. Oczekiwana kolejność: in Controller, in Service (tylko raz, mimo proxy CGLIB), tx begin, sql select, tx commit, out Service, out Controller. Ten sam test na WildFly bez jboss.modules.system.pkgs powinien dać NoClassDefFoundError, co sprawdza wykrywanie tej pułapki.
- **AspectJ load-time weaving (aspectjweaver jako javaagent + zewnętrzny aop.xml)**: Serwis z metodą publiczną a(), która woła this.b() (prywatną, @Transactional). Spring AOP pokaże tylko a(), LTW pokaże a() i b(). Porównanie obu wyników pokazuje różnicę proxy vs weaving.
- **JFR Method Timing & Tracing (JEP 520), bez agenta i bez zmian w kodzie**: Spring Boot na JDK 25, filtr method-trace=@org.springframework.web.bind.annotation.RestController;com.firma.OrderService. GET /orders/1 powinien dać 2 zdarzenia jdk.MethodTrace na tym samym eventThread, a w stack trace serwisu ma być metoda kontrolera. Wariant z filtrem @org.springframework.web.bind.annotation.RequestMapping i metodami z samym @GetMapping sprawdza, czy działają meta-adnotacje.
- **Narzędzia attach bez restartu: Arthas trace/watch, Byteman rules, BTrace**: Uruchomiona aplikacja. Arthas trace na OrderController.get i OrderService.find, potem GET /orders/1. Oczekiwane drzewo z thread_name=http-nio-...-exec-N i czasem dla OrderRepository.findById.
- **Diagnostyka samą konfiguracją logowania Springa (MVC/WebFlux/tx/JDBC/Hibernate)**: Endpoint z @Transactional serwisem, który woła drugi serwis z REQUIRES_NEW, a potem JdbcTemplate.update. Oczekiwane w logu: Creating new..., Suspending current transaction, creating new..., Initiating transaction commit, Resuming suspended transaction..., Executing prepared SQL update, Initiating transaction commit. Parser ma odtworzyć zagnieżdżenie.
- **Proxy JDBC: P6Spy i datasource-proxy (konfiguracja, bez zmian w kodzie)**: Jedna metoda zapisuje 3 encje (batch_size=20), a potem robi JdbcTemplate.queryForObject. Oczekiwane: przy FlushMode AUTO zapytanie natywne wymusza flush, więc najpierw batch INSERT, potem SELECT, potem commit. Bez zapytania między zapisami INSERT-y idą jako batch dopiero przy commit. Parser powinien oznaczyć INSERT jako 'odroczony do flush'.
- **Hibernate StatementInspector (hook SQL na poziomie ORM)**: findById z lazy kolekcją dotykaną poza repozytorium (w serwisie). Oczekiwane 2 zdarzenia sql: pierwsze w trakcie metody repozytorium, drugie (select kolekcji) w trakcie metody serwisu. Test wykrywa SQL 'z lazy loadingu' przypisany do innej klasy niż repozytorium.
- **Doklejany jar z auto-konfiguracją Spring Boot (PropertiesLauncher loader.path), bez zmian w źródłach**: Gotowy fat jar demo, bez rekompilacji, uruchomiony przez PropertiesLauncher z loader.path=flowlens-boot.jar. W raporcie warunków ma być FlowLensAutoConfiguration matched, a GET /orders/1 ma dać in, tx begin, tx commit, out. Wariant: aplikacja z własnym JpaTransactionManager, gdzie oczekiwany jest brak tx, co sprawdza wykrywanie pułapki.
- **Filtr wejścia: Servlet Filter / OncePerRequestFilter / HandlerInterceptor / WebFilter (zmiana w kopii repo)**: Trzy endpointy: synchroniczny, DeferredResult z odpowiedzią z @Async i rzucający wyjątek. Oczekiwane: 1 para in/out dla każdego. Dla async out dopiero po zakończeniu pracy, więc filtr trzeba zarejestrować także dla ASYNC (shouldNotFilterAsyncDispatch=false) i pominąć pierwsze wyjście. Dla wyjątku nie może być dodatkowego in dla /error.
- **Aspekt Spring AOP na klasach (@Aspect / XML <aop:config>, zmiana w kopii repo)**: Serwis A.publicA() woła this.privateB() i repo.findById(1) (JpaRepository). Oczekiwane: in A.publicA, in SimpleJpaRepository.findById (klasa celu), out, out. Brak privateB to oczekiwany wynik proxy, LTW pokaże privateB. Wariant z wyjątkiem w findById: dokładnie jedno out z exc.
- **Hooki transakcji: TransactionExecutionListener (Spring 6.1+), TransactionSynchronization, JTA TransactionSynchronizationRegistry**: Serwis A (REQUIRED) woła B (REQUIRES_NEW), które rzuca checked exception złapany w A. Oczekiwane: tx begin A (new), tx begin B (new, A zawieszona), tx commit B (bo checked), tx commit A. Drugi wariant z RuntimeException: rollback B, commit A, jeśli A łapie wyjątek. Trzeci wariant: B z REQUIRED rzuca RuntimeException złapany w A, co daje UnexpectedRollbackException przy commit A. Na EJB ten sam scenariusz z @TransactionAttribute(REQUIRES_NEW).
- **Hooki SQL w bibliotekach niebędących JPA: MyBatis Interceptor, jOOQ ExecuteListener, Querydsl SQLListener, JdbcTemplate**: Mapper z selectById (z <cache/>) wołany 2 razy w jednej transakcji. Oczekiwane: 2 zdarzenia na Executor.query, 1 na StatementHandler.prepare. jOOQ: insert w transakcji Springa, kolejność tx begin, sql (executeStart/End), tx commit.
- **Jakarta EE / Java EE: interceptory CDI/EJB, filtry JAX-RS, handlery JAX-WS, MDB**: WAR na WildFly: JAX-RS OrderResource -> @Stateless OrderService -> JPA, plus wysłanie JMS do @MessageDriven. Domyślny interceptor w ejb-jar.xml i filtr JAX-RS. Oczekiwane: in Resource, in OrderService, sql, out, out. Osobny przebieg MDB z kor przeniesionym przez JMSCorrelationID.
- **Wejścia z komunikatów: Kafka, RabbitMQ, JMS (Spring), Spring Integration**: HTTP POST publikuje komunikat z nagłówkiem X-Correlation-Id. Listener @KafkaListener zapisuje do bazy, a pierwsza próba rzuca wyjątek (DefaultErrorHandler z 1 ponowieniem). Oczekiwane: przebieg HTTP i dwa przebiegi KAFKA z tym samym kor i offsetem, z rollback w pierwszym i commit w drugim.
- **Wejścia z harmonogramów: Quartz listeners (konfiguracja), @Scheduled, @Async i TaskDecorator**: Job Quartz co 5 s, który wywołuje serwis z @Transactional i wysyłkę maila przez @Async. Oczekiwane: in z DiagJobListener (kor=fireInstanceId), in Service, tx, sql, out, a w wątku task-1 zdarzenie z tym samym kor (tylko z TaskDecorator).
- **Axon Framework: MessageHandlerInterceptor / MessageDispatchInterceptor i CorrelationDataProvider**: POST /orders -> commandGateway.sendAndWait(CreateOrder) -> agregat emituje OrderCreated -> projekcja (tracking processor) zapisuje do bazy JPA. Oczekiwane: przebieg HTTP z in AXON-CMD i uow-commit, a osobno (inny wątek, później) in AXON-EVT z tym samym correlationId oraz SQL projekcji.
- **Micronaut i Quarkus: interceptory compile/build-time, filtry, konfiguracja logów**: Quarkus REST + Panache: GET /orders/1 z interceptorem @Diagnosed na serwisie i access logiem. Oczekiwane: linia access logu z %I = executor-thread-1, w JSONL in/out serwisu na tym samym wątku i SQL z org.hibernate.SQL. Wariant @NonBlocking/Uni sprawdza utratę kor.
- **Legacy: Spring 3/4 XML i Struts 1/2, wstrzyknięcie przez deskryptory XML**: Aplikacja Struts 2 + Spring 3.1 XML + Hibernate 3: /orders!list.action -> OrderAction.list -> OrderService (proxy JDK) -> OrderDao (HibernateTemplate). Oczekiwane: in OrderAction.list (interceptor Struts), in OrderService, in OrderDao, sql (P6Spy), out x3, result=success.
- **Kontener servletów: Tomcat AccessLogValve / Undertow / Jetty RequestLog (konfiguracja, granice requestu z wątkiem)**: Dwa równoległe requesty do różnych endpointów, logowanie aplikacji z %thread. Parser ma przypisać logi do właściwego requestu po %I i oknie [in, out]. Wariant z DeferredResult: oczekiwane oznaczenie 'niepewne dopasowanie'. Wariant Boot 2 vs Boot 3 z tym samym wzorcem %D sprawdza wykrycie jednostki.
- **Micrometer Observation: jeden bean ObservationHandler zbiera HTTP, @Scheduled, Kafka/Rabbit, klientów HTTP i JDBC (Spring 6 / Boot 3+)**: Boot 3 z actuatorem: GET /orders/1, wewnątrz RestClient do usługi zewnętrznej i @Scheduled co 10 s. Oczekiwane: in/out http.server.requests z uri=/orders/{id}, zagnieżdżone in/out http.client.requests na tym samym wątku, osobny przebieg tasks.scheduled.execution. Wariant z new RestTemplate() ma pokazać brak wyjścia HTTP.
- **Proxy R2DBC (r2dbc-proxy) i logi Spring R2DBC dla stosów reaktywnych**: WebFlux + Spring Data R2DBC: GET /orders/1 -> ReactiveCrudRepository.findById. Oczekiwane: zdarzenie sql z wątkiem reactor-tcp-*, różnym od wątku filtra. Bez propagacji kontekstu kor=null, co detektor ma oznaczyć jako 'korelacja po czasie'.
- **Wyjścia HTTP: ClientHttpRequestInterceptor / RestClient / ExchangeFilterFunction / Feign / JAX-RS ClientRequestFilter**: GET /orders/1 woła RestTemplate z buildera i drugi RestTemplate z new. Oczekiwane: zdarzenia call/ret tylko dla pierwszego, z tym samym kor i nagłówkiem X-Request-Id w usłudze docelowej. Drugi ma być wykryty jako 'wyjście niewidoczne'.

