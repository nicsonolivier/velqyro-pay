# ADR 0003: Isolamento entre organizações e auditoria

**Situação:** aceita (Etapa 1)

## Isolamento

- Toda rota de dados de uma organização tem `:orgId` no caminho e passa pelo `OrgAccessGuard`.
- Quem não é membro recebe 404, a mesma resposta de uma organização que não existe.
- Recursos filhos (membros, convites) são buscados sempre com `organizationId` na condição, então um ID de outra organização não é encontrado.
- A permissão vem da matriz em `packages/shared/src/roles.ts`, declarada na rota com `@RequirePermission(área, nível)`.

## Papéis

- Convidar, trocar o papel e remover exigem que quem age tenha, em todas as áreas, pelo menos o poder do papel envolvido (`canGrant`, no pacote compartilhado). Um administrador, que não saca, não cria nem remove alguém do financeiro.
- Quem sai da equipe ou perde o direito de gerenciá-la tem os convites pendentes cancelados na mesma transação.
- Só existe um convite aberto por e-mail em cada organização. A criação é serializada no banco (trava consultiva por organização e e-mail) e há um teto de 50 convites abertos.

## Documento (CPF/CNPJ)

- O documento **não** é único no banco. Antes do KYC ninguém provou ser dono dele, então digitar o CNPJ de outra empresa não pode impedir a dona de se cadastrar.
- A criação é recusada quando a mesma pessoa repete o documento ou quando ele já pertence a uma organização verificada. Duplicatas entre organizações pendentes são resolvidas na análise de KYC (Etapa 2).

**Pendência:** a regra hoje é aplicada na API. Segurança por linha no PostgreSQL (RLS) entra na Etapa 3, junto das primeiras tabelas de negócio (produtos, clientes, pedidos), como segunda barreira.

## Auditoria

- `audit_logs` só aceita inserção. Gatilhos no banco recusam `UPDATE`, `DELETE` e `TRUNCATE`, inclusive vindos da própria API.
- A tabela não tem chaves estrangeiras, de propósito: o registro sobrevive à exclusão de usuários e organizações.
- Os metadados levam só dados seguros (e-mail do convidado, papel anterior e novo). Senhas, tokens e segredos nunca entram.
- Ações que mudam dados e auditoria juntas rodam na mesma transação.
- Excluir um usuário que ainda é membro de alguma organização é recusado pelo banco, para uma organização nunca perder o proprietário em silêncio.

**Pendência:** o usuário de banco da API é o dono das tabelas e, como dono, conseguiria desligar os gatilhos. Em produção a API deve usar um usuário sem posse das tabelas, com apenas `INSERT` e `SELECT` em `audit_logs`, e as migrations devem rodar com outro usuário.
