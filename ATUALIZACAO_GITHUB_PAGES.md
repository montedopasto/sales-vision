# GitHub Pages — implementação corrigida

A versão 0.3 substitui a dependência de um servidor web Node pela publicação estática no GitHub Pages. O browser acede diretamente ao Supabase existente. Excel e importação manual funcionam no navegador; email é tratado por uma função no próprio Supabase, sem expor chaves privilegiadas. O job diário pode correr no GitHub Actions.

Foram removidos o servidor Express e as chamadas da interface a /api. O callback Microsoft respeita o caminho /sales-vision/ e a sessão da Sales Vision tem uma chave própria, separada das outras aplicações.

20 testes passaram com os dois relatórios privados ativados. A leitura Excel, preservação de SSCC, geração de formulário e SHA-256 também foram executadas com sucesso num navegador real a servir apenas o build estático sob /sales-vision/.

A função Supabase de envio foi testada localmente quanto a autenticação, membro ativo, dono da encomenda, conta Outlook, tentativa única e resultado incerto. A execução real no Supabase continua dependente de configuração e ensaio; nenhum email foi enviado.

## Publicação concluída — 29/10/2026

O utilizador autorizou expressamente tornar público o repositório e publicar no GitHub Pages. A mudança foi concluída, Pages foi ativado com origem GitHub Actions e o workflow de publicação terminou com sucesso.

Site aberto e verificado: https://montedopasto.github.io/sales-vision/.

A variável PAGES_ENABLED=true já está configurada para publicar futuras alterações da main. O código e histórico estão públicos por autorização do utilizador. Os anexos originais, config/live.json e credenciais não estão no repositório nem no site.

A página publicada ainda mostra configuração pendente, com login desativado. Permanecem pendentes a configuração Entra/Supabase, as migrações, a publicação da função de envio e o ficheiro de clientes. Nenhum email de encomenda foi enviado e nenhuma base de produção foi modificada.
