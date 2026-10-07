# Relatório da Etapa 1: Fundação

Data: 07/10/2026

## Ponto de partida

O repositório tinha 14 arquivos (706 linhas): um painel React + Vite com telas de acesso, dashboard, Produtos, construtor de checkout, Vendas, Clientes e Financeiro. Tudo era visual: sem servidor, sem banco, com dados fixos nos componentes, e qualquer e-mail e senha entravam.

## O que foi criado

**Estrutura**
- Monorepo com workspaces do npm: `apps/web`, `apps/api`, `packages/shared`.
- PostgreSQL local por Docker Compose, `.env.example`, ESLint e GitHub Actions.

**Regras compartilhadas (`packages/shared`)**
- Matriz de permissões: 6 papéis por 11 áreas, e a regra de quem pode conceder qual papel.
- Validação e formatação de CPF, CNPJ (numérico e alfanumérico), e-mail e telefone; regras e medidor de senha; estados da conta.

**API (`apps/api`, NestJS + Prisma)**
- Autenticação: cadastro, login, logout, confirmação de e-mail e telefone, recuperação e troca de senha.
- Sessões opacas em cookie, com lista e encerramento por dispositivo.
- 2FA por TOTP com códigos de uso único e códigos de recuperação.
- Contador único de tentativas erradas por conta, com bloqueio de 15 minutos.
- Organizações (PF e PJ), membros, convites e troca de papel.
- Guarda de isolamento por organização e de permissão por rota.
- Auditoria somente inserção.
- Erros padronizados em português, validação de entrada, limite de requisições, checagem de origem e ID de requisição.
- Caixa de saída de desenvolvimento no lugar de e-mail e SMS reais.

**Painel (`apps/web`)**
- Telas de acesso ligadas à API, com validação por campo e estados de carregamento e erro.
- Novas telas: verificação em duas etapas, confirmação de e-mail, redefinição de senha, aceite de convite, Equipe, Configurações (Perfil, Segurança, Negócio) e caixa de saída.
- Rotas com endereço próprio, seletor de organização e menu conforme o papel.
- A sessão é conferida de novo ao voltar para a aba e quando outra aba entra ou sai.

## O que mudou no que já existia

- Os arquivos do painel foram movidos para `apps/web` com `git mv`, preservando o histórico.
- `App.tsx` virou o mapa de rotas; o dashboard foi para `pages/Overview.tsx` sem mudança visual.
- `Auth.tsx` manteve o visual e passou a chamar a API.
- Produtos, Checkout, Vendas, Clientes e Financeiro seguem como estavam, com dados de demonstração.
- Removido o cartão "Plano Pro" da barra lateral: o botão não tinha ação e a plataforma ainda não tem planos. No lugar entraram o seletor de organização e o cartão do usuário.
- Integrações e API / Webhooks, que eram botões sem ação, agora abrem uma página que diz em que etapa chegam.
- Corrigido um estouro de largura no celular (a grade do painel não deixava as tabelas rolarem dentro do cartão).

## Banco e migrations

Uma migration, `20261007000000_etapa1_fundacao`, com 10 tabelas: `users`, `sessions`, `verification_tokens`, `two_factor_methods`, `recovery_codes`, `organizations`, `organization_members`, `invitations`, `audit_logs` e `outbox_messages`. Inclui os gatilhos que impedem alterar, apagar ou esvaziar a auditoria.

## Revisão independente

Esta etapa foi refeita a partir do `main`. Antes de abrir o novo pull request, três revisores que não escreveram o código procuraram defeitos em autenticação, em organizações e permissões, e no encaixe entre o painel e a API. O que eles confirmaram foi corrigido:

**Autenticação**
- O limite de 5 códigos errados do segundo fator valia por login, não por conta: bastava entrar de novo com a senha para ganhar mais 5. Agora o contador é da conta e é o mesmo da senha.
- O contador de senhas erradas podia ser contornado com requisições simultâneas. O incremento passou para o banco.
- O mesmo código do aplicativo autenticador valia por 90 segundos, inclusive para desativar o 2FA. Agora cada código vale uma vez.
- Com o segundo fator pendente, `GET /auth/me` devolvia o perfil e as organizações. Agora não devolve nenhum dado da conta.
- Ativar o 2FA não pedia a senha nem encerrava as outras sessões. Agora faz as duas coisas.
- Trocar a senha e desativar o 2FA aceitavam palpites de senha sem limite. Agora somam no mesmo contador.
- Sem `NODE_ENV`, a API subia em modo de desenvolvimento e a caixa de saída, com links de redefinição de senha, ficava pública. Agora a ausência conta como produção e a caixa exige `DEV_OUTBOX=true`.
- Um pedido novo de redefinição invalidava o link anterior, o que deixava um terceiro inutilizar o link de outra pessoa. Agora os links convivem e há um pedido por minuto.

**Organizações e equipe**
- Um administrador conseguia convidar ou promover alguém a Financeiro, papel que saca e que ele mesmo não tem. Agora ninguém concede, altera ou remove um papel com mais poder que o seu.
- A auditoria recusava `UPDATE` e `DELETE`, mas não `TRUNCATE`. Agora recusa os três.
- Seis alterações gravavam o dado e a auditoria em comandos separados. Agora vão na mesma transação.
- Qualquer pessoa podia registrar o CNPJ de outra empresa e impedir a dona de se cadastrar. O documento deixou de ser único antes do KYC.
- Convites pendentes continuavam valendo depois que quem convidou saía da equipe. Agora são cancelados junto.
- Duas requisições simultâneas criavam dois convites abertos para o mesmo e-mail. A criação agora é serializada, e há um teto de 50 convites abertos.
- Dava para aceitar convite de uma organização suspensa.
- O CNPJ alfanumérico, emitido pela Receita Federal desde julho de 2026, era recusado.
- Excluir um usuário apagaria em silêncio o proprietário de uma organização. O banco agora recusa.

**Painel**
- Quem tinha 2FA ativo não conseguia entrar: depois da senha, a tela voltava para o login vazio. Era o defeito mais grave e só aparecia com a API real.
- Entrar, criar conta e recuperar senha compartilhavam o estado: a mensagem de uma tela aparecia na outra.
- Quem criava a conta a partir de um convite perdia o convite ao confirmar o e-mail em outra aba e era levado a criar uma organização própria.
- Recarregar a página "API / Webhooks" mostrava uma resposta crua da API, por causa do proxy do Vite.
- Trocar de conta em outra aba deixava a aba antiga salvar dados na conta nova.
- Os códigos de recuperação sumiam ao trocar de aba dentro de Configurações.
- A tela de Equipe oferecia papéis e ações que a API recusaria.

Os 33 pontos em que o painel chama a API foram conferidos um a um contra as rotas reais (método, endereço, campos enviados e campos lidos): nenhuma divergência.

## O que foi verificado e como

O ambiente em que este código foi escrito não tinha acesso ao registro de pacotes (npm). Por isso a instalação, o build e os testes rodaram no GitHub Actions, no pull request desta etapa, e terminaram sem falhas.

| Item | Onde rodou | Situação |
| --- | --- | --- |
| `npm install` com as dependências reais | GitHub Actions | Passou |
| Testes das regras compartilhadas (15) | GitHub Actions e local | Passou |
| `prisma validate` | GitHub Actions | Passou |
| Migration aplicada em PostgreSQL 16 | GitHub Actions e local | Passou |
| Migration bate com o `schema.prisma` (`prisma migrate diff`) | GitHub Actions | Passou |
| Tipos e build da API | GitHub Actions | Passou |
| Testes da API: 53 em 5 arquivos (18 unitários; 19 de autenticação; 16 de organizações, papéis e isolamento) | GitHub Actions | 53 de 53 passaram |
| Tipos e build do painel | GitHub Actions | Passou |
| Lint | GitHub Actions | Passou |
| Gatilhos da auditoria recusam `UPDATE`, `DELETE` e `TRUNCATE` | GitHub Actions e local | Passou |
| Fluxos do painel (login com 2FA, convite, equipe, configurações): 16 roteiros em navegador | Local | Passaram, com uma API simulada e bibliotecas substitutas |
| Painel no navegador ligado à API real | — | **Não executado.** Os testes da API cobrem as rotas e os roteiros cobrem as telas, mas as duas partes ainda não foram usadas juntas em um navegador |

## Problemas encontrados

- Registro de pacotes bloqueado no ambiente de desenvolvimento (descrito acima).
- O painel original guarda preços como número decimal. Não foi alterado nesta etapa; passa a centavos inteiros na Etapa 3, quando Produtos ganhar API.
- `Finance.tsx` (tela de demonstração) gera um aviso de chave repetida do React. Será resolvido quando a tela ganhar dados reais, na Etapa 5.

## Riscos pendentes

1. **Sem `package-lock.json`.** O registro de pacotes estava bloqueado onde o código foi escrito, então o arquivo de trava não pôde ser gerado. Sem ele, cada instalação pode trazer versões um pouco diferentes. Rodar `npm install` uma vez na sua máquina e subir o `package-lock.json` gerado; depois disso o CI pode trocar `npm install` por `npm ci`.
2. **Painel e API ainda não foram usados juntos em um navegador.** Vale um teste manual do cadastro até o convite de um membro, incluindo o login com 2FA, antes de aprovar.
3. **Bloqueio de conta como forma de atrapalhar.** Quem conhece o e-mail de alguém consegue manter a conta bloqueada errando a senha de propósito. Trocar por atraso progressivo antes de abrir ao público.
4. **Cadastro e aviso de bloqueio revelam se um e-mail tem conta.** Decidir de forma consciente antes do lançamento.
5. **E-mail e SMS reais.** Só existe a caixa de saída, que guarda links e códigos em texto no banco. Antes de qualquer uso real é preciso ligar um provedor de envio.
6. **Usuário de banco da API.** Hoje é o dono das tabelas e conseguiria desligar os gatilhos da auditoria. Em produção, usar um usuário sem posse das tabelas.
7. **RLS no PostgreSQL.** O isolamento entre organizações é aplicado na API. A segunda barreira, no banco, entra na Etapa 3.
8. **Limite de requisições em memória.** Com mais de uma instância da API, precisa ir para o Redis.
9. **Documento repetido entre organizações pendentes.** É permitido de propósito e precisa ser resolvido na análise de KYC da Etapa 2.
10. **Hash de senha.** scrypt atende a recomendação da OWASP; a troca para Argon2id está isolada em um arquivo.
11. **Troca de e-mail e transferência de posse** ainda não existem.
12. **Revisão jurídica/compliance.** Termos de uso, política de privacidade, LGPD e o modelo de KYC não foram tratados nesta etapa.

## Próximo passo recomendado

1. Revisar e aprovar o pull request desta etapa; subir o `package-lock.json`.
2. Etapa 2: site público e onboarding com envio de documentos (KYC/KYB), incluindo o estado "KYC em análise".
