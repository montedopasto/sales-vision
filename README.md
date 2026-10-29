# Sales Vision — Monte do Pasto

Aplicação comercial independente da StockVision AI. Interface responsiva, autenticação Microsoft Entra através de Supabase Auth, encomendas partilhadas, reservas transacionais FEFO/SSCC, importação FRZ/FRE, formulário Zolve FM.01107 e envio Outlook Graph.

**Estado:** código compilado e testado localmente, incluindo os relatórios reais de 29/10/2026. As referências FRZ/FRE e o modelo anexo ao EML já foram analisados e integrados. A aplicação ainda requer a ligação autorizada ao Entra/Supabase e o ficheiro de clientes. Não foram aplicadas migrações em produção nem enviados emails.

## Arranque

Node.js 22.14+.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Abrir http://localhost:3000. Sem Supabase configurado, o login fica desativado. O backend serve `dist/` quando existe, ou Vite quando não existe. Em desenvolvimento, manter o backend na porta 3000 e executar `npx vite` noutra consola para atualizar a interface automaticamente.

## Referências já integradas

- **FRZ/FRE DailyReport:** folha `STOCK`, cabeçalhos reais `Warehouse`, `SSCC`, `Article Code`, `Article Name`, `Delivery Date`, `Lot Code`, `BBD`, `#Boxes`, `#Weight`, `Zone`, `BlockedReasonCode` e `MotivoBloqueio`. Não se usa `#Pieces` como caixas nem se soma a folha `STOCK - OUT OF DATE`, que repete linhas do stock.
- **Data:** retirada do nome `Monte do Pasto (FRZ|FRE) Montijo_YYYYMMDD_DailyReport.xlsx`. O ficheiro indica um dia, não uma hora de observação. A interface mostra a data do relatório. Para estas importações, só o relatório do dia em Lisboa é considerado atualizado. É uma regra conservadora provisória, a confirmar no processo de negócio. Snapshots legados com hora explícita mantêm o limite provisório de 26 horas.
- **Bloqueios:** `Bloqueado` e motivos de bloqueio são preservados. Linhas sem descrição, lote ou validade, com entrada posterior à validade, peso negativo ou zona sem temperatura validada são guardadas com os valores originais e colocadas em quarentena. Não são corrigidas nem vendidas automaticamente. Identificadores ilegíveis, SSCC inválido e estruturas desconhecidas recusam o ficheiro inteiro.
- **Temperatura:** FRZ usa -18 °C, como no pedido de saída fornecido. FRE4 usa 4 °C, indicado na própria zona do relatório. Zonas novas exigem configuração.
- **Zolve FM.01107:** formulário com cabeçalho, código/designação, número de caixas, SSCC, temperatura, destinatário e data de entrega. Uma linha por alocação SSCC. A hora de entrega não é inventada. O contacto vem do utilizador que criou a encomenda. A folha gerada não contém os pedidos antigos, as moradas contraditórias em células ocultas nem o milhão de linhas vazias formatadas do original. A morada sai sempre do cliente selecionado.
- **Distribuição de email:** a lista real To/CC do EML foi preparada no `config/live.json` local e incluída na entrega ZIP privada. Não foi colocada no GitHub. O endereço impresso no cabeçalho do formulário é distinto da lista de distribuição do email, tal como na referência.

`config/defaults.json` contém os mapeamentos validados e o perfil FM.01107. `config/live.json` é um override local ignorado pelo Git. O repositório, por si só, não contém destinatários de envio. Consultar `CONFIGURACAO.md`.

## Isolamento da StockVision

Referência: `montedopasto/stockvision-ai`, `index.html`, SHA `8759bd9c8ad688f0be5453af639633469ba77713`.

A StockVision lê SSCC, produto, lote, datas, armazém e KG de uma Google Sheet e substitui `stocks_current`, acrescentando `stocks_history`. Esse importador não mostra quantidades em caixas nem estados comerciais.

A Sales Vision usa o **mesmo projeto Supabase**, com **tabelas próprias `sv_*`**, alimentadas pelos DailyReports. As migrações não leem, alteram ou removem `stocks_current`/`stocks_history`, nem alteram a sincronização existente. Não há conversão KG → caixas nem credenciais copiadas do código da referência.

## Configurações ainda pendentes

1. **Supabase:** preencher `.env` com URL, publishable key e `service_role` apenas no servidor. Fazer backup e ensaiar numa base de teste. Aplicar `db/001_sales_vision.sql` e depois `db/002_daily_reports.sql`, uma vez e nesta ordem. Se 001 já foi aplicada, executar só 002. A migração 002 não reescreve a migração anterior e bloqueia stock legado sem metadados até reimportação.
2. **Entra ID:** registar uma aplicação single tenant, ativar Azure no Supabase com o tenant específico e configurar callback `https://<projeto>.supabase.co/auth/v1/callback`. Autorizar o domínio HTTPS da Sales Vision nos redirects Supabase. O login pede `email`, `offline_access`, `User.Read` e `Mail.Send`. Seguir a [documentação Supabase Azure](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure). As permissões da StockVision não são alteradas.
3. **Utilizadores:** associar cada `auth.users.id` ao object ID imutável Entra em `sv_users`, com `role='sales'` ou `'admin'`. A primeira conta admin é criada pelo administrador SQL. Não há autorização automática só por pertencer ao Microsoft 365. O envio compara `/me.id` com o object ID autorizado.
4. **Clientes:** falta o Excel de clientes, não incluído nos três ficheiros fornecidos. Os destinatários de um pedido antigo não substituem o cadastro completo. O parser de clientes exige ID, nome e morada completa, com cabeçalhos mapeados a partir do ficheiro real.
5. **Leitura diária automática:** configurar mailbox/pasta, remetente autorizado e Entra app-only `Mail.Read`, limitado à mailbox de integração por políticas/RBAC Exchange. Agendar `npm run sync` num serviço externo e monitorizar falhas. Os nomes de anexo FRZ/FRE e a data já estão configurados. Não se presume que o remetente de um pedido comercial é o remetente dos relatórios de stock.
6. **Envio:** disponibilizar `config/live.json` no servidor, rever a distribuição do EML para o processo atual e validar uma encomenda de teste antes de usar em produção. O envio não acontece durante a importação nem durante os testes. `Mail.Send` é delegado pela conta comercial. O botão Enviar reclama uma única tentativa e regista a resposta Graph.
7. **Alojamento:** serviço Node sob HTTPS. Para contentor, `HOST=0.0.0.0`, atrás de proxy HTTPS. GitHub Pages sozinho não serve o backend. Configurar backups, monitorização e retenção de auditoria.

## Regras de reservas e envios

- Todas as linhas são reservadas ou nenhuma. Caixas inteiras, produtos únicos, cliente ativo e entrega a partir de hoje em Lisboa.
- FEFO por validade, depois entrada, SSCC e ID. Só stock atualizado, não bloqueado e válido na data da entrega. Não foram inventadas regras de mínimo de validade por cliente, múltiplos, prazos ou restrições adicionais de armazém.
- Importações, reservas, cancelamentos e transições de envio usam o mesmo advisory transaction lock. Pedidos repetidos com o mesmo UUID de criação devolvem a mesma encomenda. Não há reservas acima da quantidade existente.
- Snapshot completo por origem, deduplicado por SHA-256 e monotónico na data. Linhas ausentes passam a zero caixas; um relatório com cabeçalhos válidos e zero linhas limpa a origem de forma transacional. Um ficheiro diferente com a mesma data fica bloqueado como ambíguo: confirmar a revisão com a Zolve antes de intervenção administrativa.
- Reduções abaixo das reservas sinalizam conflitos, sem libertar caixas por suposição. Cancelamento com libertação apenas antes do envio. Depois do envio, reservas permanecem até confirmação administrativa da expedição reconciliada e refletida no stock. A reconciliação automática de movimentos depende de regras ainda não recuperadas do histórico.
- Clientes, contacto comercial e alocações ficam registados na encomenda. O formulário mantém as alocações originais mesmo após libertação de reservas, para permitir consulta histórica.
- Graph `/me/sendMail`: anexo <3 MB. Um 202 significa aceite pela Microsoft, não entregue à Zolve. Timeout/falha deixa `uncertain`; interrupção abrupta pode deixar `sending`. Verificar Itens Enviados antes de intervenção, sem reenvio automático. Ver [Microsoft sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail).
- O backend não guarda refresh tokens Microsoft. Pode ser necessário voltar a iniciar sessão para obter um token Outlook válido.
- Dashboard: últimas 200 encomendas. Clientes/stock são paginados em lotes de 500 até 100.000 linhas; o limite REST Supabase deve ser pelo menos 500. Reservas são calculadas na base, sem depender da lista visível.

## Testes

```sh
npm test
npm run build
```

A suite normal usa dados sintéticos e ignora dois testes de ficheiros privados. Para repetir a validação dos anexos reais, definir `SALES_VISION_FRZ_FILE` e `SALES_VISION_FRE_FILE` com os caminhos locais antes de executar `npm test`. Os anexos não são incluídos no Git.

As migrações SQL reais e PL/pgSQL são executadas no PGlite. Testes cobrem FEFO, reversão, idempotência, insuficiência, conflitos, RLS, estados de envio, snapshots por dia, relatórios vazios, quarentena de dados, SSCC, temperaturas e formulário FM.01107. A contenção entre sessões deve ser ensaiada adicionalmente em PostgreSQL/Supabase. Login real Entra e envio/receção Zolve ainda dependem da configuração da organização.
