# Configuração — versão 0.5

GitHub Pages: https://montedopasto.github.io/sales-vision/. Autenticação Entra no tenant Monte do Pasto, provider Azure ativo, redirect exato configurado e primeiro administrador associado. Consentimento de perfil, sessão e Mail.Send apenas para José Almanso.

Stock: função stockvision-read consulta Google Sheets STOCKS, exclusivamente ZOLVE. Não usa stocks_current/history. Publicar a função a partir de supabase/functions/stockvision-read, com JWT ativo. SALES_VISION_ALLOWED_ORIGINS=https://montedopasto.github.io. Supabase fornece as variáveis de servidor; não colocar credenciais em Pages. O leitor não usa Google API keys, OAuth novo ou alterações de partilha.

Migrações: aplicar 001–005 por ordem, sem reaplicar as existentes. A migração 005 substitui a tentativa anterior de fonte Supabase e preserva reservas/encomendas. Não modificar tabelas da StockVision.

A função send-zolve está publicada com JWT ativo. Configuração Zolve privada em sv_settings, baseada no EML fornecido. Não foi enviado nenhum email. O fluxo comercial completo continua dependente de caixas, bloqueios, temperatura/data do relatório e da lista real de clientes. A folha atual tem KG e dados básicos; a app não inventa caixas.

Os antigos jobs de importação FRZ/FRE e mailbox foram removidos. Não criar outro importador. As rotinas Excel mantêm-se apenas como referência, para clientes e para a geração do pedido Zolve.


Atualização 0.6: o leitor Google Sheets reconhece CaixasDisponiveis, Bloqueado, MotivoBloqueio, TipoStock e DataRelatorio. Apresenta caixas físicas, estado, FRZ/FRE e data real do relatório. Não deduz temperatura a partir do tipo. Para consulta, considera atual apenas o relatório do dia em Europe/Lisbon; datas futuras são assinaladas. A data de leitura continua separada. As reservas e o envio continuam indisponíveis até concluir a ligação transacional; o servidor devolve reservations_enabled=false e mantém available=0. A interface não apresenta as caixas físicas como disponíveis para reservar.
