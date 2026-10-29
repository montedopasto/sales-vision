# Atualização das referências — 29/10/2026

Os dois DailyReports fornecidos e o Excel FM.01107 anexado ao EML foram analisados sem alterar os originais. A implementação passou a usar os cabeçalhos, folha de stock, bloqueios e formulário reais. Nenhum email foi enviado e nenhuma base de produção foi alterada.

## Stock verificado

| Referência | Linhas STOCK | Caixas no ficheiro | Linhas com problemas de dados | Linhas bloqueadas na importação |
|---|---:|---:|---:|---:|
| FRZ — Montijo, 29/10/2026 | 394 | 6.034 | 8 | 43 |
| FRE — Montijo, 29/10/2026 | 32 | 805 | 0 | 0 |

As oito linhas com problemas incluem campos em falta, uma entrada posterior à validade e quatro pesos negativos. Existem sobreposições com bloqueios já indicados pela Zolve. Os valores originais, motivos e localização na folha ficam preservados; não são corrigidos por suposição. As 12 linhas expiradas do FRZ também são excluídas da seleção por validade, incluindo uma linha sem bloqueio explícito. A folha `STOCK - OUT OF DATE` repete linhas e não é somada.

Estes totais descrevem os ficheiros, não a disponibilidade em produção nem uma confirmação comercial. Na aplicação, validade na data da entrega, data do relatório e reservas existentes continuam a ser verificadas.

## Pedido Zolve

O modelo fornecido tem cabeçalho e campos fixos a partir da linha 15, com artigos a partir da linha 17. Foi implementado um formulário compacto equivalente com código, designação, caixas, SSCC, temperatura, destinatário e data de entrega.

O original contém pedidos antigos, moradas contraditórias em células ocultas e formatação vazia até perto do limite de linhas Excel. Os novos documentos não herdam esses resíduos. A morada é preenchida pelo cliente selecionado, o contacto vem do comercial autenticado e os SSCC são texto de 18 dígitos. Os ficheiros gerados são reabertos nos testes para verificar tipos, caixas, temperaturas e datas. O total de caixas tem fórmula SUM com valor calculado guardado.

Os To/CC do EML estão preparados no override local `config/live.json`, incluído no ZIP e ignorado pelo Git. O cadastro completo de clientes não foi inferido a partir de um único pedido.

## Entrega e validação

- Migração nova `db/002_daily_reports.sql`, a aplicar depois de 001. Só modifica estruturas Sales Vision.
- Importação dos dois ficheiros reais testada até às tabelas PostgreSQL locais PGlite, reconciliando contagem, caixas e peso, sem dados de produção.
- 14 testes passaram com as duas referências reais ativadas. Sem os ficheiros privados, a suite normal ignora esses dois testes.
- Formulário FM.01107 verificado por reabertura e inspeção visual. Na pré-visualização do renderizador, SSCC numérico em texto pode aparecer normalizado; os testes de reabertura do XLSX confirmam os 18 dígitos e zeros à esquerda guardados como texto.
- Compilação da interface concluída.

## Pendente para uso real

Ficheiro de clientes, configuração e autorização Entra/Supabase, alojamento HTTPS e agendamento do importador de email. Regras comerciais adicionais que não vieram no histórico continuam por validar, incluindo restrições de armazém, mínimos de validade e revisão de snapshots do mesmo dia. A aplicação usa uma regra conservadora de relatório do dia para as importações FRZ/FRE.
