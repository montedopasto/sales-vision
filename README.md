# Sales Vision — Monte do Pasto

Aplicação comercial independente da StockVision, publicada em https://montedopasto.github.io/sales-vision/. GitHub Pages + Supabase existente; não requer servidor web separado.

## Fonte única de stock

A versão 0.4 lê `stocks_current` da StockVision diretamente, sem copiar ou importar FRZ/FRE. Reservas, encomendas, clientes e configurações continuam nas tabelas `sv_`. O código e o importador StockVision ficam intactos. A Sales Vision atualiza a leitura ao navegar e quando regressa ao separador.

A integração usa apenas SELECT na origem, com acesso da aplicação limitado aos membros ativos. A migração 004 não altera tabelas, permissões ou triggers da StockVision. Retirou-se o job separado de importação de mailbox e o carregamento manual de stock. Mantém-se a importação de clientes.

## Limitação verificada na origem

O esquema atual publica artigo, descrição, SSCC, lote, datas de entrada/validade, armazém, kg e data de inserção. Não publica caixas, estado de bloqueio, temperatura nem data do relatório. A aplicação apresenta os quilos e impede reservas/envios enquanto esses dados comerciais estiverem em falta. Não converte kg em caixas e não inventa metadados. A tabela stocks_current estava vazia na inspeção de 30/10/2026; stocks_history continha 70 962 registos, que não são tratados como stock atual.

Login Microsoft e associação do primeiro administrador verificados. O fluxo de reservas e envio em produção depende dos dados comerciais acima e da lista real de clientes. Nenhum email foi enviado.

## Desenvolvimento

Node 22 ou superior. Executar `npm ci`, `npm test`, `npm run build` e `npm start`.

As migrações em db/ aplicam-se por ordem, 001–004; não reaplicar as já executadas. Os testes PGlite cobrem reservas e segurança, incluindo a leitura direta do esquema real e a recusa de reservas sem caixas. Os testes de parser/Excel são de referência e não constituem um segundo importador de stock.

Consultar CONFIGURACAO.md e STOCKVISION.md. Nunca publicar credenciais Entra ou chaves de servidor.
