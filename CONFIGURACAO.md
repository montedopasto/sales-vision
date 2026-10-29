# Contrato de configuração — preencher apenas a partir das referências reais

`config/live.json` não é incluído no Git. O exemplo entregue está intencionalmente vazio.

Cada elemento de `stock.FRZ` e `stock.FRE` precisa de:

| Campo | Significado |
|---|---|
| `reviewed` | `true` só depois de validar o anexo original |
| `sheet` | Nome exato da folha |
| `headerRow` | Número, base 1, da linha dos cabeçalhos |
| `columns` | Objeto que associa cada campo interno abaixo ao cabeçalho original exato |
| `allowedStatuses` | Todos os valores comerciais reconhecidos na coluna de estado, incluindo bloqueados |
| `blockedStatuses` | Subconjunto que não pode ser vendido |
| `fileNamePattern` | Regex que distingue inequivocamente os anexos da origem, no worker |
| `snapshotPattern` | Regex com grupo nomeado `date`, obtido do nome do anexo |
| `snapshotTimeSuffix` | Sufixo de hora/fuso, apenas se esse horário estiver confirmado no processo |

Campos de stock: `warehouse`, `sscc`, `product`, `description`, `lot`, `expires`, `entered`, `boxes`, `blocked`. Datas são células Excel de data ou texto ISO `AAAA-MM-DD`. `boxes` deve ser número inteiro. `sscc` é texto de 18 dígitos com checksum GS1 válido, nunca número Excel. Qualquer linha inválida recusa o ficheiro completo. A origem precisa de um snapshot completo e não de um ficheiro de movimentos/deltas.

`clients` usa `reviewed`, `sheet`, `headerRow` e `columns`, com os campos `id`, `name`, `address`, `postal_code`, `city`. A importação faz upsert e não elimina clientes ausentes. Desativação de clientes é uma operação administrativa da base nesta versão.

`zolve` usa `reviewed`, `sheet` e `columns`, um array ordenado de objetos `{ "header": <cabeçalho real>, "field": <campo interno>, "width": <largura opcional> }`. Campos suportados: `order_id`, `client_id`, `client_name`, `address`, `postal_code`, `city`, `delivery`, `product`, `description`, `sscc`, `lot`, `warehouse`, `boxes`, `expires`.

No nível raiz, `recipients` e `cc` são arrays de endereços reais. `subjectPrefix` e `body` têm de estar definidos. No corpo pode usar `{{order_id}}` e `{{delivery}}`. O servidor não aceita destinatários arbitrários enviados pelo browser.

## Primeiro administrador

Após o utilizador existir em Supabase Auth, executar pelo SQL Editor, substituindo os parâmetros pelos IDs reais:

```sql
-- Valores obtidos de Supabase Auth e Microsoft Entra, respetivamente.
insert into public.sv_users(id, entra_oid, role)
values ('<UUID REAL SUPABASE AUTH>', '<OBJECT ID REAL ENTRA>', 'admin');
```

Nunca adicionar credenciais em ficheiros do frontend. A aplicação não executa esta instrução automaticamente.

## Verificar envios incertos

Consultar `sv_shipments` e os Itens Enviados pela conta comercial, usando o UUID da encomenda no assunto. Não mudar estados para permitir reenvio sem verificar primeiro. A versão entregue deixa `sending`/`uncertain` em quarentena e mantém as caixas reservadas; a resolução requer intervenção administrativa auditada fora da interface. Definir o procedimento operacional e a retenção de auditoria antes de produção.
