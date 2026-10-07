# Relatório da Etapa 1: Fundação

Data: 07/10/2026

## Ponto de partida

O repositório tinha 14 arquivos (706 linhas): um painel React + Vite com telas de acesso, dashboard, Produtos, construtor de checkout, Vendas, Clientes e Financeiro. Tudo era visual: sem servidor, sem banco, com dados fixos nos componentes, e qualquer e-mail e senha entravam.

## O que foi criado

**Estrutura**
- Monorepo com workspaces do npm: `apps/web`, `apps/api`, `packages/shared`.
- PostgreSQL local por Docker Compose, `.env.example`, ESLint e GitHub Actions.

**Regras compartilhadas (`packages/shared`)**
- Matriz de permissões: 6 papéis por 11 áreas.
- Validação e formatação de CPF, CNPJ, e-mail e telefone; regras e medidor de senha; estados da conta.

**API (`apps/api`, NestJS + Prisma)**
- Autenticação: cadastro, login, logout, confirmação de e-mail e telefone, recuperação e troca de senha.
- Sessões opacas em cookie, com lista e encerramento por dispositivo.
- 2FA por TOTP com códigos de recuperação.
- Organizações (PF e PJ), membros, convites e troca de papel.
- Guarda de isolamento por organização e de permissão por rota.
- Auditoria somente inserção.
- Erros padronizados em português, validação de entrada, limite de requisições, checagem de origem e ID de requisição.
- Caixa de saída de desenvolvimento no lugar de e-mail e SMS reais.

**Painel (`apps/web`)**
- Telas de acesso ligadas à API, com validação por campo e estados de carregamento e erro.
- Novas telas: verificação em duas etapas, confirmação de e-mail, redefinição de senha, aceite de convite, Equipe, Configurações (Perfil, Segurança, Negócio) e caixa de saída.
- Rotas com endereço próprio, seletor de organização e menu conforme o papel.

## O que mudou no que já existia

- Os arquivos do painel foram movidos para `apps/web` com `git mv`, preservando o histórico.
- `App.tsx` virou o mapa de rotas; o dashboard foi para `pages/Overview.tsx` sem mudança visual.
- `Auth.tsx` manteve o visual e passou a chamar a API.
- Produtos, Checkout, Vendas, Clientes e Financeiro seguem como estavam, com dados de demonstração.
- Removido o cartão "Plano Pro" da barra lateral: o botão não tinha ação e a plataforma ainda não tem planos. No lugar entraram o seletor de organização e o cartão do usuário.
- Integrações e API / Webhooks, que eram botões sem ação, agora abrem uma página que diz em que etapa chegam.
- Corrigido um estouro de largura no celular (a grade do painel não deixava as tabelas rolarem dentro do cartão).

## Banco e migrations

Uma migration, `20261007000000_etapa1_fundacao`, com 10 tabelas: `users`, `sessions`, `verification_tokens`, `two_factor_methods`, `recovery_codes`, `organizations`, `organization_members`, `invitations`, `audit_logs` e `outbox_messages`. Inclui o gatilho que impede alterar ou apagar a auditoria.

## O que foi verificado e como

O ambiente em que este código foi escrito não tinha acesso ao registro de pacotes (npm). Por isso a instalação, o build e os testes rodaram no GitHub Actions, no pull request desta etapa. Todas as execuções terminaram sem falhas.

| Item | Onde rodou | Situação |
| --- | --- | --- |
| `npm install` com as dependências reais | GitHub Actions | Passou |
| Testes das regras compartilhadas (11) | GitHub Actions e local | Passaram |
| `prisma validate` | GitHub Actions | Passou |
| Migration aplicada em PostgreSQL 16 | GitHub Actions e local | Passou |
| Migration bate com o `schema.prisma` (`prisma migrate diff`) | GitHub Actions | Passou, sem diferença |
| Tipos da API | GitHub Actions | Passou |
| Build da API | GitHub Actions | Passou |
| Testes da API: 31 em 3 arquivos (9 de senha, TOTP, cifra e tokens; 13 de autenticação; 9 de organizações, papéis e isolamento) | GitHub Actions | 31 de 31 passaram |
| Tipos e build do painel | GitHub Actions | Passou |
| Lint | GitHub Actions | Passou |
| Gatilho da auditoria recusa `UPDATE` e `DELETE` | Local, em PostgreSQL 16 | Passou |
| Exclusão de usuário remove vínculos e preserva a auditoria | Local, em PostgreSQL 16 | Passou |
| Telas novas (18 capturas em computador e 5 em celular) | Local | Conferidas com uma API simulada; sem erros de página nem estouro de largura |
| Painel no navegador ligado à API real | — | **Não executado.** Os testes da API cobrem as rotas e as capturas cobrem as telas, mas as duas partes ainda não foram usadas juntas em um navegador |

## Problemas encontrados

- Registro de pacotes bloqueado no ambiente de desenvolvimento (descrito acima).
- O painel original guarda preços como número decimal. Não foi alterado nesta etapa; passa a centavos inteiros na Etapa 3, quando Produtos ganhar API.

## Riscos pendentes

1. **Sem `package-lock.json`.** O registro de pacotes estava bloqueado onde o código foi escrito, então o arquivo de trava não pôde ser gerado. Sem ele, cada instalação pode trazer versões um pouco diferentes. Rodar `npm install` uma vez na sua máquina e subir o `package-lock.json` gerado; depois disso o CI pode trocar `npm install` por `npm ci`.
2. **Painel e API ainda não foram usados juntos em um navegador.** Vale um teste manual do cadastro até o convite de um membro antes de aprovar.
3. **E-mail e SMS reais.** Só existe a caixa de saída. Antes de qualquer uso real é preciso ligar um provedor de envio.
4. **RLS no PostgreSQL.** O isolamento entre organizações é aplicado na API. A segunda barreira, no banco, entra na Etapa 3.
5. **Limite de requisições em memória.** Com mais de uma instância da API, precisa ir para o Redis.
6. **Reuso de código TOTP** dentro da janela de 90 segundos. Corrigir antes das ações que exigem 2FA (saques).
7. **Hash de senha.** scrypt atende a recomendação da OWASP; a troca para Argon2id está isolada em um arquivo.
8. **Troca de e-mail e transferência de posse** ainda não existem.
9. **Revisão jurídica/compliance.** Termos de uso, política de privacidade, LGPD e o modelo de KYC não foram tratados nesta etapa.

## Próximo passo recomendado

1. Revisar e aprovar o pull request desta etapa; subir o `package-lock.json`.
2. Etapa 2: site público e onboarding com envio de documentos (KYC/KYB), incluindo o estado "KYC em análise".
