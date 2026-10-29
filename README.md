# Sales Vision — Monte do Pasto

**A aplicação é alojada no GitHub Pages.** O browser comunica diretamente com o Supabase existente para dados, autenticação e reservas transacionais. O envio Outlook usa uma Edge Function no mesmo Supabase. Não é necessário contratar ou manter um servidor Node para servir a aplicação.

A StockVision existente mantém o seu repositório, importador e tabelas. A Sales Vision só usa estruturas próprias `sv_*` no projeto Supabase partilhado.

## Componentes

| Componente | Onde funciona |
|---|---|
| Interface responsiva | GitHub Pages |
| Clientes, stock, encomendas e reservas FEFO/SSCC | Supabase existente, com RLS e funções PostgreSQL |
| Login Microsoft Entra | Supabase Auth / Microsoft |
| Importação manual e Excel Zolve FM.01107 | Browser, após autenticação |
| Envio Outlook e registo da submissão | Supabase Edge Function `send-zolve` |
| Leitura automática dos relatórios | GitHub Actions, quando configurado e ativado |

Node é usado para compilar/testar e no job de sincronização. Não existe um servidor web Node necessário em produção, nem chamadas da aplicação a `/api` ou localhost.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` compila a aplicação, executa testes e prepara o artefacto estático. Só publica quando é executado manualmente ou existe a variável `PAGES_ENABLED=true` no repositório.

1. Ativar **Settings → Pages → GitHub Actions** no repositório `montedopasto/sales-vision`.
2. Configurar as variáveis públicas `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` em **Settings → Secrets and variables → Actions → Variables**, ou editar `public/config.json` com esses dois valores públicos.
3. Executar o workflow Sales Vision · GitHub Pages. Depois da primeira publicação, `PAGES_ENABLED=true` ativa atualizações a cada push na main.

**Publicado e verificado:** https://montedopasto.github.io/sales-vision/. O workflow de publicação terminou com sucesso em 29/10/2026. A variável PAGES_ENABLED=true já está definida para publicar futuras alterações da main.

**Visibilidade:** repositório público por autorização expressa do utilizador em 29/10/2026. GitHub Pages está ativado com origem GitHub Actions e HTTPS. Não foi contratado upgrade. O login na aplicação continua desativado até preencher a configuração pública do Supabase e concluir as configurações Entra/Supabase indicadas abaixo.

O site estático não contém clientes, stock real, destinatários de email, service role ou segredos Microsoft. A pasta `dist` é o único artefacto publicado; `config/live.json`, anexos e testes não fazem parte do site. Acesso a dados exige login e membro ativo, independentemente da visibilidade do código.

## Preparar o Supabase existente

Aplicar, uma vez e nesta ordem, após backup e ensaio:

1. `db/001_sales_vision.sql`
2. `db/002_daily_reports.sql`
3. `db/003_github_pages.sql`

Não reaplicar migrações já executadas. A 003 acrescenta `sv_settings` e uma função de configuração limitada a administradores. Os destinatários e o mapeamento de clientes ficam nessa tabela protegida, não no bundle público.

Após a primeira autenticação Microsoft, adicionar os utilizadores autorizados em `sv_users`, associando `auth.users.id`, object ID Entra e função sales/admin. Não há autorização automática apenas por ter uma conta Microsoft.

Para carregar a configuração de integração, usar o conteúdo do `config/live.json` privado como valor da linha `sv_settings.id='integration'`, pelo SQL Editor do Supabase. O ficheiro é ignorado pelo Git e existe no ZIP local. Não colar service role ou client secret nessa configuração.

## Microsoft e envio de email

Configurar o provider Azure single tenant no Supabase e o callback `https://<projeto>.supabase.co/auth/v1/callback` no Entra. Autorizar também o URL completo do GitHub Pages, incluindo `/sales-vision/`, nos redirects Supabase. O browser usa PKCE e uma chave de sessão própria da Sales Vision para não interferir com outras apps que usam o mesmo projeto.

O login pede email, offline_access, User.Read e Mail.Send. As permissões da StockVision não são alteradas. Seguir a [documentação Supabase Azure](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure).

Publicar `supabase/functions/send-zolve` no projeto Supabase. A função mantém `verify_jwt=true` e volta a validar a sessão por `auth.getUser`. Definir o segredo `SALES_VISION_ALLOWED_ORIGINS=https://montedopasto.github.io` (origem sem o caminho) e confirmar as variáveis de projeto SUPABASE_URL, ANON/PUBLISHABLE_KEY e SERVICE_ROLE_KEY no ambiente das funções. Nenhuma chave privilegiada vai para o browser.

A função confirma membro ativo, dono da encomenda e correspondência do `/me.id` Microsoft com o object ID autorizado. Gera novamente o Excel com as alocações da base, lê os destinatários da configuração privada e reclama uma única tentativa antes do sendMail. O cliente não fornece destinatários, ficheiro ou estado de sucesso. Timeout/falha fica incerto, sem repetição automática.

Um 202 Graph significa aceite pela Microsoft, não entregue à Zolve. Login real e execução no runtime Supabase ainda exigem configuração e ensaio no projeto; os testes locais exercitam a mesma lógica da função com serviços simulados, sem enviar emails.

## Relatórios e formulário já integrados

Os DailyReports FRZ/FRE fornecidos usam a folha STOCK. #Boxes é a quantidade em caixas; #Weight é preservado sem conversões. A folha STOCK - OUT OF DATE repete linhas e não é somada. Bloqueios, campos em falta, datas incoerentes e pesos negativos são preservados; linhas afetadas ficam impedidas de reserva.

A data é retirada do nome original do DailyReport. Como os ficheiros só indicam o dia, a interface não inventa uma hora de observação. Por decisão conservadora provisória, só o relatório do dia em Lisboa é considerado atualizado. Snapshots antigos com hora explícita mantêm o limite provisório de 26 horas.

O formulário Zolve FM.01107 contém os campos reais de artigo, caixas, SSCC, temperatura, destinatário e data de entrega. Remove pedidos antigos, moradas ocultas contraditórias e formatação vazia excessiva. O contacto vem do criador da encomenda e a morada vem do cliente selecionado. Não se inventa hora de entrega. FRZ usa -18 °C como no pedido fornecido; FRE4 usa 4 °C como indicado na zona.

Ainda falta o Excel de clientes para validar os respetivos cabeçalhos. Não se inferiu um cadastro completo a partir de um pedido antigo.

## Reservas e rastreabilidade

Reserva atómica de todas as linhas, FEFO por validade, entrada, SSCC e ID. Só stock atualizado, não bloqueado e válido para a data de entrega. Caixas inteiras, cliente ativo e produtos únicos. Importação, reserva, cancelamento e envio usam o mesmo advisory transaction lock.

Snapshot completo por origem, SHA-256 e data monotónica. Relatórios vazios com cabeçalhos válidos limpam o stock da origem. Ficheiros diferentes com a mesma data são recusados como ambíguos. Linhas que desaparecem passam a zero e podem sinalizar conflitos, sem libertar reservas por suposição.

Cancelamento com libertação apenas antes do envio. Depois de enviado, a libertação depende de confirmação administrativa da expedição reconciliada e refletida no stock. Reconciliação automática de movimentos e regras comerciais adicionais continuam dependentes das regras completas não recuperadas do histórico.

Histórico: últimas 200 encomendas. Stock/clientes: páginas de 500 até 100.000 registos. O limite REST Supabase deve ser pelo menos 500. As reservas são calculadas no PostgreSQL, independentemente da lista visível.

## Sincronização automática no GitHub

`.github/workflows/stock-sync.yml` executa o importador Node como job temporário GitHub Actions. Fica desativado até `SALES_VISION_SYNC_ENABLED=true`.

Configurar as variáveis de mailbox, pasta e remetente real, tenant/client ID, e os segredos ENTRA_CLIENT_SECRET e SUPABASE_SERVICE_ROLE_KEY nas definições do repositório. A aplicação app-only requer Mail.Read limitada à mailbox de integração. O workflow corre diariamente às 08:00 UTC; confirmar o horário operacional antes de ativar. Não é um servidor alojado nem envia encomendas.

## Desenvolvimento e testes

```sh
npm ci
npm start
npm test
npm run build
```

`npm start` serve apenas a interface estática por Vite para desenvolvimento. Para verificar o build estático, usar `npm run preview`. Para os testes dos dois anexos privados, definir SALES_VISION_FRZ_FILE e SALES_VISION_FRE_FILE com os caminhos locais. Sem eles, esses dois testes são ignorados.

Testes verificam as migrações reais em PGlite, FEFO, rollback, conflitos, RLS, configuração privada, importação dos relatórios, preservação de SSCC e formulário, chamadas diretas do cliente ao Supabase e autorização/idempotência/resultado incerto da função de envio. A contenção entre sessões e o login/envio reais devem ser ensaiados no Supabase/Entra.
