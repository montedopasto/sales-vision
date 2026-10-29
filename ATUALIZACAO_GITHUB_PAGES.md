# GitHub Pages — implementação corrigida

A versão 0.3 substitui a dependência de um servidor web Node pela publicação estática no GitHub Pages. O browser acede diretamente ao Supabase existente. Excel e importação manual funcionam no navegador; email é tratado por uma função no próprio Supabase, sem expor chaves privilegiadas. O job diário pode correr no GitHub Actions.

Foram removidos o servidor Express e as chamadas da interface a /api. O callback Microsoft respeita o caminho /sales-vision/ e a sessão da Sales Vision tem uma chave própria, separada das outras aplicações.

20 testes passaram com os dois relatórios privados ativados. A leitura Excel, preservação de SSCC, geração de formulário e SHA-256 também foram executadas com sucesso num navegador real a servir apenas o build estático sob /sales-vision/.

A função Supabase de envio foi testada localmente quanto a autenticação, membro ativo, dono da encomenda, conta Outlook, tentativa única e resultado incerto. A execução real no Supabase continua dependente de configuração e ensaio; nenhum email foi enviado.

## Impedimento concreto à publicação

A página de definições GitHub Pages do repositório privado montedopasto/sales-vision mostra: “Upgrade or make this repository public to enable Pages”. A aplicação foi adaptada, mas ainda não está publicada num URL Pages. Não foi contratado upgrade nem alterada a visibilidade do repositório.

Tornar o repositório público expõe código e histórico, incluindo os totais usados nos testes. Os anexos originais, config/live.json e credenciais não estão no repositório. Essa mudança de visibilidade precisa de autorização do utilizador.

O workflow Pages está preparado. A publicação só corre depois de execução manual ou de ativar PAGES_ENABLED=true. A migração 003 guarda a configuração privada no Supabase; não contém destinatários ou credenciais reais.

Permanecem pendentes a configuração Entra/Supabase, migrações, publicação da função de envio e ficheiro de clientes. Essas configurações são independentes de contratar alojamento web adicional, que deixou de ser necessário.
