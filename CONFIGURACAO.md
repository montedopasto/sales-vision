# Configuração de produção — GitHub Pages + Supabase existente

Não é necessário alojamento web Node separado.

1. Concluído: repositório tornado público com autorização expressa do utilizador em 29/10/2026. GitHub Pages ativo, com publicação confirmada.
2. Concluído: Pages configurado com GitHub Actions e PAGES_ENABLED=true. O site foi aberto e verificado em https://montedopasto.github.io/sales-vision/. O workflow publica só a pasta dist.
3. Preencher as variáveis públicas SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY do build, ou public/config.json. Nunca usar service role ou segredos Entra nestes campos.
4. Aplicar as migrações 001, 002 e 003, por ordem, depois de ensaio e backup, sem reaplicar as já executadas.
5. Configurar o provider Entra/Azure e autorizar o redirect completo do GitHub Pages, incluindo /sales-vision/. Adicionar os membros reais em sv_users.
6. Publicar a função send-zolve no projeto Supabase com verify_jwt ativo. Configurar SALES_VISION_ALLOWED_ORIGINS com a origem real do site, por exemplo https://montedopasto.github.io. A validação de utilizador e autorização também acontece dentro da função.
7. Guardar o override privado config/live.json na linha sv_settings.id='integration'. Os To/CC são os do EML fornecido. Não colocar esse ficheiro no GitHub Pages. Validar a distribuição atual antes do primeiro envio real.
8. Fornecer o Excel de clientes para definir clients.sheet, headerRow e columns com os campos id, name, address, postal_code e city. Não inferir as moradas a partir de células ocultas do pedido antigo.
9. Ativar o importador diário GitHub Actions apenas depois de configurar a mailbox, remetente, permissões Mail.Read e segredos do job. A importação manual funciona diretamente no browser e Supabase.

Para adicionar o primeiro administrador, depois de o utilizador existir no Supabase Auth:

```sql
insert into public.sv_users(id, entra_oid, role)
values ('<UUID REAL SUPABASE AUTH>', '<OBJECT ID REAL ENTRA>', 'admin');
```

O mapeamento real dos DailyReports e o formulário FM.01107 estão em supabase/functions/_shared/defaults.json. config/defaults.json mantém uma cópia para o job Node. O conteúdo do override privado é mesclado com estes defaults. Os únicos dados de configuração públicos são a URL e a publishable key do Supabase.

Envios sending/uncertain mantêm as reservas. Verificar os Itens Enviados pelo UUID antes de qualquer intervenção. Nunca repetir automaticamente um envio sem confirmação do resultado.
