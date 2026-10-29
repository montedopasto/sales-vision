# Configuração — referências FRZ/FRE e Zolve já integradas

`config/defaults.json` contém os cabeçalhos e nomes de ficheiro reais, a política de bloqueio e o formulário FM.01107. O servidor lê esses defaults e aplica os overrides de `INTEGRATION_CONFIG`, ou `config/live.json` quando a variável está ausente.

## Overrides locais

O `config/live.json` preparado nesta sessão contém os destinatários To/CC do EML de referência. Está ignorado pelo Git e incluído no ZIP local privado. Se instalar só a partir do repositório, copiar esse ficheiro para o servidor ou configurar os arrays `recipients` e `cc` com a distribuição real autorizada. Não é necessário colocar contactos no código público.

`subjectPrefix` e `body` podem ser alterados. O corpo suporta `{{order_id}}` e `{{delivery}}`. O browser não pode escolher destinatários arbitrários. O código não envia emails durante os testes ou importações.

O campo `zolve.formEmail` é o endereço impresso no formulário original; a distribuição do email é lida de `recipients`/`cc`, preservando essa distinção. O contacto comercial é guardado na criação a partir do utilizador autenticado; não é copiado da Fernanda para encomendas de outros comerciais. Um telefone não fornecido fica em branco.

## Clientes — ficheiro ainda necessário

Configurar `clients` depois de analisar o Excel real:

- `reviewed`: verdadeiro depois de validar o ficheiro.
- `sheet`: nome exato da folha.
- `headerRow`: linha de cabeçalhos, base 1.
- `columns`: correspondências reais para `id`, `name`, `address`, `postal_code`, `city`.

A importação faz upsert e não apaga clientes ausentes. Não se deve importar as moradas contraditórias e ocultas no pedido antigo como cadastro de clientes.

## Migrações e primeiro administrador

Executar `db/001_sales_vision.sql` e `db/002_daily_reports.sql`, nesta ordem, pelo SQL Editor, após ensaio e backup. Se a primeira migração já existe, aplicar só 002.

Depois do utilizador existir no Supabase Auth, associar os IDs reais:

```sql
insert into public.sv_users(id, entra_oid, role)
values ('<UUID REAL SUPABASE AUTH>', '<OBJECT ID REAL ENTRA>', 'admin');
```

A aplicação não executa esta instrução automaticamente. Chaves privadas e service role ficam apenas no servidor.

## Stock e data do relatório

Manter os nomes originais `Monte do Pasto (FRZ) Montijo_YYYYMMDD_DailyReport.xlsx` e equivalente FRE. Importar a folha `STOCK` completa. `STOCK - OUT OF DATE` contém duplicações e não deve ser somada. `HANDLING IN/OUT` são movimentos, não um snapshot de disponibilidade.

A importação guarda o dia do relatório, sem afirmar que o stock foi medido à meia-noite ou à hora de receção. O campo legado `observed_at` usa o início do dia UTC como limite normalizado e tem `observed_precision='date'`; a interface mostra `report_date`. Para estes relatórios, as encomendas requerem data igual ao dia atual em Lisboa. Esta regra conservadora deve ser revista com o processo comercial, sobretudo fins de semana e dias sem ficheiro.

As colunas de peso são preservadas, incluindo negativos, e nunca são convertidas em caixas. Linhas sem metadados essenciais ou com peso negativo ficam bloqueadas com o motivo visível. Estados de bloqueio desconhecidos recusam a importação em vez de serem tratados como disponíveis. Novas zonas precisam de uma temperatura configurada.

## Envios incertos

Consultar `sv_shipments` e os Itens Enviados usando o UUID da encomenda no assunto. Não mudar estados para permitir reenvio antes de verificar. `sending`/`uncertain` mantêm reservas; a resolução exige intervenção administrativa auditada. Definir retenção e procedimento operacional antes de produção.
