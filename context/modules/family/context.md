# @saas/family — Contexto do Módulo

## Responsabilidade
Criação de família, convites, papéis e membresia.

## Entidades
- **Family** — id, name, createdByUserId, createdAt, updatedAt
- **FamilyMember** — familyId, userId, role (admin | member | viewer), status (invited | active | removed)

## Use Cases
- `CreateFamilyUseCase` — cria família, publica `family.created`
- `GetCurrentFamilyUseCase` — família atual do usuário
- `InviteMemberUseCase` — convida membro (admin), publica `member.invited`
- `AcceptInviteUseCase` — aceita convite, publica `member.joined`
- `RemoveMemberUseCase` — remove membro (admin), publica `member.removed`

## Eventos que Publica
- `family.created`, `member.invited`, `member.joined`, `member.removed`

## Eventos que Consome
- Nenhum

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)

## Repositórios
- `IFamilyRepository` — interface para persistência de famílias
- `IFamilyMemberRepository` — interface para membresias