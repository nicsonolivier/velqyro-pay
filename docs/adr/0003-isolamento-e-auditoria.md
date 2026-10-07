# ADR 0003: Isolamento entre organizações e auditoria

**Situação:** aceita (Etapa 1)

## Isolamento

- Toda rota de dados de uma organização tem `:orgId` no caminho e passa pelo `OrgAccessGuard`.
- Quem não é membro recebe 404, a mesma resposta de uma organização que não existe.
- Recursos filhos (membros, convites) são buscados sempre com `organizationId` na condição, então um ID de outra organização não é encontrado.
- A permissão vem da matriz em `packages/shared/src/roles.ts`, declarada na rota com `@RequirePermission(área, nível)`.

**Pendência:** a regra hoje é aplicada na API. Segurança por linha no PostgreSQL (RLS) entra na Etapa 3, junto das primeiras tabelas de negócio (produtos, clientes, pedidos), como segunda barreira.

## Auditoria

- `audit_logs` só aceita inserção. Um gatilho no banco recusa `UPDATE` e `DELETE`, inclusive vindos da própria API.
- A tabela não tem chaves estrangeiras, de propósito: o registro sobrevive à exclusão de usuários e organizações.
- Os metadados levam só dados seguros (e-mail do convidado, papel anterior e novo). Senhas, tokens e segredos nunca entram.
- Ações que mudam dados e auditoria juntas rodam na mesma transação.
