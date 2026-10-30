# Stock partilhado — 30/10/2026

A Sales Vision lê diretamente public.stocks_current através de uma função apenas de leitura, limitada aos membros ativos de sv_users. As tabelas, regras, permissões, código e importador da StockVision não são alterados. Não existe cópia nem importação FRZ/FRE pela Sales Vision. O job de mailbox separado foi removido. A importação de clientes mantém-se.

Aplicar db/004_stockvision_live.sql após 001–003. A migração preserva as tabelas sv_ e reservas anteriores, troca apenas a leitura de sv_available e valida o stock da origem antes do envio. As antigas funções de importação de stock deixam de poder ser executadas pelos clientes ou pelo service role.

Esquema real verificado: codigo_artigo, nome_produto, sscc, lote, data_entrada_lote, data_validade, armazem, kg, created_at. A tabela estava vazia na inspeção. A data de inserção não é apresentada como data de medição/relatório. Quilos são mostrados como quilos.

Este esquema não publica caixas, estado de bloqueio, temperatura ou data do relatório. As linhas são mostradas mas ficam impedidas de reserva e envio. Não se convertem quilos em caixas nem se assume que um lote está desbloqueado. Para concluir o fluxo comercial, a origem precisa de disponibilizar esses dados ou uma fonte comercial validada equivalente. Isso exige uma decisão explícita sobre a integração existente; esta alteração não modifica a StockVision.
