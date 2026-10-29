# Sales Vision — Monte do Pasto

Aplicação comercial independente, Fase 1, versão 0.1.0. Interface responsiva em português, encomendas partilhadas, autenticação Microsoft através de Supabase Auth, seleção FEFO e reservas transacionais PostgreSQL, importação Excel de clientes/FRZ/FRE, exportação XLSX configurável e envio Graph pela conta do comercial.

**Estado de entrega:** código executável, compilado e testado localmente. Não está ligado a produção. Não foram aplicadas migrações, alteradas contas Microsoft, enviadas mensagens ou importados dados reais. Os anexos e a parte inicial do histórico não foram disponibilizados pelo leitor de conversa nesta sessão. Os formatos e regras que deles dependem ficam explicitamente por validar; o código bloqueia essas operações até existir configuração real.

## Arranque

Node.js 22.14+ (recomendado 22 LTS atualizado).

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Abrir http://localhost:3000. Sem variáveis reais, mostra uma página de configuração e mantém o login desativado. `npm run dev` serve a compilação existente; para desenvolvimento com Vite, remover `dist/` ou executar `npx vite` e manter o backend em 3000. O servidor inclui Vite quando não existe `dist/`.

## Isolamento da StockVision

Referência consultada: `montedopasto/stockvision-ai`, `index.html`, SHA `8759bd9c8ad688f0be5453af639633469ba77713`.

O código atual da referência lê SSCC, produto, lote, datas, armazém e KG de uma Google Sheet e substitui `stocks_current`, acrescentando linhas a `stocks_history`. Não mostra coluna de caixas nem estados comerciais de bloqueio. Por isso, reutilizar esse importador provocaria perda de informação necessária às encomendas.

A Sales Vision usa o **mesmo projeto Supabase**, com **tabelas próprias `sv_*`**. A migração não lê, altera ou remove `stocks_current`/`stocks_history`, não copia credenciais do repositório e não modifica a sincronização existente. Até confirmação do esquema real, a alimentação operacional é feita diretamente pelos anexos FRZ/FRE, mantendo SSCC e caixas explícitas. Não existe conversão implícita KG → caixas.

## Configuração pendente para produção

1. **Supabase:** preencher URL e publishable key do projeto existente, chave `service_role` apenas no servidor. Fazer backup e ensaiar a migração numa cópia de teste. Executar `db/001_sales_vision.sql` uma vez pelo SQL Editor. Todas as tabelas têm RLS; só os membros ativos podem ler e apenas funções transacionais podem escrever.
2. **Microsoft Entra ID:** registar aplicação single tenant, ativar Azure provider no Supabase com tenant específico. Configurar callback `https://<projeto>.supabase.co/auth/v1/callback` no Entra e URL HTTPS da Sales Vision na allowlist de redirects Supabase. Seguir [documentação Supabase Azure](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure). O browser solicita `email`, `offline_access`, `User.Read` e `Mail.Send`. Dar consentimento conforme as políticas do tenant. Não conceder permissões novas à app StockVision.
3. **Autorizar comerciais:** depois da primeira autenticação, associar cada `auth.users.id` ao object ID imutável do utilizador Entra, em `sv_users`, com `role='sales'` ou `'admin'`. A primeira conta admin deve ser adicionada pelo administrador da base. Nenhum utilizador é autorizado automaticamente apenas por ter e-mail Microsoft. O envio valida `/me.id` contra `entra_oid`.
4. **Anexos reais:** copiar `config/example.json` para `config/live.json` e definir `INTEGRATION_CONFIG`. Validar os cabeçalhos, folha, primeira linha de cabeçalho e estados FRZ/FRE; SSCC tem de chegar como texto, com checksum válido. Não preencher por suposição. Ver `CONFIGURACAO.md`.
5. **Zolve:** validar as colunas e ordem do Excel, destinatários/CC, assunto e corpo com os anexos Excel/EML. O exportador genérico suporta folha tabular e uma linha por alocação SSCC. Se o original exigir células fixas, fórmulas ou um modelo gráfico, é necessário adaptar o exportador ao original antes de ativar `reviewed`. Nenhum layout Zolve é declarado validado nesta entrega.
6. **Stock diário automático:** configurar mailbox/pasta, remetente autorizado, patterns FRZ/FRE, data do snapshot e credenciais app-only para Graph `Mail.Read`. Limitar a aplicação à mailbox de integração através das políticas/RBAC Exchange. Agendar `npm run sync` num serviço externo e monitorizar o exit code. O script não instala um agendamento por si. Não usa a data de receção como se fosse a data do stock. `service_role` fica no worker/servidor.
7. **Alojamento:** usar serviço Node sob HTTPS, `HOST=0.0.0.0` em contentor e configurar `APP_ORIGIN`. Não alojar apenas no GitHub Pages: o backend é necessário para Excel, importação e registo seguro do envio. Não há chaves no bundle; `/api/config` só expõe URL/chave pública. Acrescentar observabilidade, backups e limites de acesso adequados ao serviço de alojamento.

## Regras implementadas e limites

- Reserva atómica de todas as linhas; FEFO por validade, entrada, SSCC e ID para desempate. Caixas inteiras, produtos únicos na encomenda, cliente ativo, entrega a partir de hoje em Lisboa. Produto não bloqueado, validade pelo menos até à entrega e snapshot observado nas últimas 26 horas. Este limiar de 26 horas é uma **decisão provisória**, não uma regra recuperada dos anexos.
- Operações de stock, reserva, cancelamento, envio e conclusão usam o mesmo advisory transaction lock. Chamadas repetidas com o mesmo request ID devolvem a mesma encomenda do mesmo utilizador. Reservas acima do stock são recusadas.
- Snapshots FRZ/FRE completos e monotónicos por origem, deduplicados por SHA-256. Linhas ausentes passam a zero caixas. Reduções abaixo das reservas sinalizam conflitos e bloqueiam o envio. Não libertam reservas automaticamente.
- Cancelamento com libertação apenas antes do envio. Encomendas enviadas mantêm reservas até confirmação administrativa de expedição reconciliada com a Zolve **e refletida no stock**. A reconciliação automática de expedições aguarda o formato/regras reais; não foi inferida apenas pelo desaparecimento do SSCC.
- Exportação e envio usam o snapshot do cliente na criação e as alocações reservadas. Não existe alteração de uma encomenda depois de reservada; cancelar e recriar antes de enviar.
- Graph delegado `/me/sendMail`, anexo <3 MB, envio manual pela conta do dono da encomenda. O 202 Graph significa aceite pela Microsoft, não entregue ao destinatário. Ver [Microsoft sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail).
- Um envio é reclamado uma só vez. Timeout/falha fica `uncertain`; falha abrupta pode deixar `sending`. Verificar Itens Enviados e reconciliar o registo antes de qualquer intervenção. Não existe reenvio automático, pois Graph não oferece garantia exatamente uma vez neste endpoint. Não são guardados refresh tokens Microsoft pelo backend; o comercial pode precisar de voltar a autenticar-se quando o token delegado expira.
- Dashboard/histórico: 200 encomendas mais recentes; clientes e stock são paginados em lotes de 500 até 100.000 linhas (o máximo REST Supabase deve ser pelo menos 500). Para bases maiores, restringir consultas e paginação na interface; o cálculo de reserva ocorre sempre no PostgreSQL, sem depender da lista exibida.
- O histórico devolvido só continha cinco turnos finais. Regras adicionais de armazéns, temperatura, mínimos de validade por cliente, múltiplos, prazos, destinatários e exceções não foram recuperadas nem inventadas.

## Verificação

```sh
npm test
npm run build
```

Os testes executam a migração SQL real e PL/pgSQL no PGlite, com utilizadores e stock **sintéticos exclusivamente de teste**. Cobrem FEFO, reversão transacional, idempotência, insuficiência, conflitos, autorização/RLS, estados de envio e leitura/escrita XLSX. PGlite executa num único processo: a contenção entre sessões deve ser validada adicionalmente num PostgreSQL/Supabase de ensaio antes da entrada em produção. Login real Entra, anexos reais e envio/receção Zolve requerem configuração e validação na organização.
