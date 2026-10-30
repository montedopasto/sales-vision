# Leitura do Google Sheets — apenas ZOLVE

Fonte verificada: https://docs.google.com/spreadsheets/d/1Ckji4wIRpD8ICvoQZ0eYG7oS_-qDreaOLv7wgU2X8dI/edit, folha STOCKS.

Leitura autenticada através da função stockvision-read, sem persistir stock. O URL de leitura CSV inclui select * where G = 'ZOLVE'. O parser confirma os oito cabeçalhos e exclui novamente qualquer armazém diferente de ZOLVE antes de devolver os dados à app. A folha e a StockVision permanecem inalteradas.

O backend não aceita URLs do browser e exige utilizador autenticado e membro ativo. Não se copiam chaves Google. A leitura pública foi verificada sem cookies ou credenciais. Não se alterou a partilha da folha.

O campo KG é lido com os separadores portugueses; SSCC mantém o texto original. A hora da leitura é separada da data de observação, desconhecida. Não existem caixas, estado de bloqueio, temperatura e data do relatório nesta folha. Os valores não são inventados. As reservas/envios ficam impedidos na interface e na base de dados.

Aplicar 005_google_sheets_source.sql após 004 para retirar as funções/views da ligação anterior e bloquear explicitamente reservas sem os dados comerciais. As tabelas de reservas e encomendas são preservadas. O teste da migração confirma a remoção da leitura da tabela errada.


Atualização 0.6: o leitor Google Sheets reconhece CaixasDisponiveis, Bloqueado, MotivoBloqueio, TipoStock e DataRelatorio. Apresenta caixas físicas, estado, FRZ/FRE e data real do relatório. Não deduz temperatura a partir do tipo. Para consulta, considera atual apenas o relatório do dia em Europe/Lisbon; datas futuras são assinaladas. A data de leitura continua separada. As reservas e o envio continuam indisponíveis até concluir a ligação transacional; o servidor devolve reservations_enabled=false e mantém available=0. A interface não apresenta as caixas físicas como disponíveis para reservar.
