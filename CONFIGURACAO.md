# Configuração atual — 30/10/2026

## Preparado no ambiente real

- Repositório público e GitHub Pages ativos, mediante autorização do utilizador.
- Supabase existente retomado; aplicação Microsoft limitada ao tenant Monte do Pasto; provider Azure ativo; redirect exato https://montedopasto.github.io/sales-vision/ autorizado.
- A conta jose.almanso@montedopasto.pt consentiu perfil, manutenção de sessão e Mail.Send apenas para a sua conta e foi associada como administrador na Sales Vision. Não houve consentimento para toda a organização.
- Configuração pública de Supabase em public/config.json; apenas URL e publishable key. Credencial Entra foi introduzida pelo utilizador diretamente no painel.
- Migrações 001–003 aplicadas. A migração 004 liga o stock em leitura direta à StockVision e retira as permissões dos importadores duplicados.
- Função send-zolve publicada com verificação JWT ativa e origem permitida https://montedopasto.github.io; destinatários do EML guardados de forma privada em sv_settings.

## Pendente para o fluxo comercial completo

A fonte stocks_current precisa de publicar caixas explícitas, estado de bloqueio, temperatura e data do relatório. O esquema atual só dispõe de kg e datas básicas; não permite reservas em caixas com segurança. A Sales Vision não modifica a integração StockVision para suprir esses campos. Ver STOCKVISION.md.

Falta o ficheiro real de clientes e validar o seu mapeamento em config/live.json/sv_settings. Não inferir dados de clientes a partir do pedido antigo. Não criar clientes de exemplo na produção.

A função de email foi publicada, mas o runtime e o fluxo comercial completo em produção ainda precisam de validação com dados completos. Qualquer envio real necessita de uma encomenda revista e autorização para o destinatário; nenhum email foi enviado.

## Instalação noutro ambiente

Aplicar db/001 a db/004 por ordem numa base com o esquema StockVision verificado. Configurar provider Azure, redirect, membros sv_users, configuração privada e função send-zolve. Preservar o Site URL e os redirects de outras aplicações.

Não ativar um segundo importador de mailbox. Os antigos scripts e workflow de importação independente foram removidos. Os ficheiros de parser continuam apenas para referências, clientes e geração Excel.
