# Sales Vision — Monte do Pasto

Aplicação comercial independente: https://montedopasto.github.io/sales-vision/. Versão 0.5.

## Fonte de stock correta

A Sales Vision consulta a folha STOCKS de StockVision AI - Monte do Pasto no Google Sheets e recebe **apenas o armazém ZOLVE**. Não importa FRZ/FRE, não lê stocks_current nem stocks_history e não guarda outra cópia do stock. Não altera a folha, o código ou o importador da StockVision.

A função stockvision-read valida a sessão Microsoft/Supabase e o membro ativo antes da leitura. Consulta apenas o URL fixo da folha, com filtro Google G='ZOLVE', e volta a filtrar o armazém no servidor. Usa a leitura CSV pública já disponível, sem copiar a chave Google da StockVision ou mudar permissões. O browser não fornece um URL arbitrário.

Supabase mantém autenticação, membros, clientes, encomendas e reservas separadas. O stock atual vem do Google Sheets em cada leitura. A página relê ao navegar, regressar ao separador, carregar Atualizar ou de minuto a minuto na visão geral/stock.

## Dados e limitações

Cabeçalhos verificados: CodigoArtigo, NomeProduto, SSCC, Lote, DataEntradaLote, DataValidade, Armazem, KG. Na verificação de 30/10/2026 havia 426 linhas ZOLVE. Quilos e SSCC são preservados; a hora de leitura não é tratada como data do relatório.

A folha não publica caixas, bloqueios, temperatura ou data do relatório. Reservas e envio continuam bloqueados enquanto faltarem esses dados; não se convertem kg em caixas nem se inventam metadados. Falta ainda o ficheiro real de clientes. Nenhum email foi enviado.

## Desenvolvimento e configuração

Node 22+: npm ci, npm test, npm run build, npm start. Aplicar db/001 até 005 por ordem sem reaplicar migrações existentes. 004 é histórica; 005 remove a ligação incorreta a stocks_current. Publicar stockvision-read e send-zolve no Supabase, com JWT ativo e SALES_VISION_ALLOWED_ORIGINS=https://montedopasto.github.io. As credenciais de servidor permanecem apenas no Supabase.

Ver CONFIGURACAO.md e STOCKVISION.md. Os parsers Excel são referências e servem os clientes e o Excel Zolve; não existe job duplicado de importação de stock.
