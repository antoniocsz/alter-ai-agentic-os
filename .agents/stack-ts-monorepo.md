# Stack: TypeScript + monorepo (regras específicas)

> Carregue esta referência quando o `harness.json` do projeto declarar um perfil com stack
> TypeScript/monorepo (`web`, `api`, `cli`) ou quando `context/project/stack.md` indicar.
> O `AGENTS.md` contém apenas o protocolo neutro; as regras abaixo são o contrato da stack.

## Fronteiras de módulo

```typescript
// ❌ NUNCA — import direto interno de outro módulo
import { algo } from '@<escopo>/outro-modulo/src/interno'

// ✅ SEMPRE — apenas via barrel export público
import { algo } from '@<escopo>/outro-modulo'
```

## tenantId em toda query tenant-scoped (se multi-tenant)

O middleware do ORM injeta automaticamente. Nunca confie em query sem o filtro.
Teste sempre: "tenant A não consegue ver dado de tenant B".

## MVVM estrito no frontend e mobile

- **View** → só JSX, zero `useQuery`/`useMutation`/`useForm` diretamente
- **ViewModel** → hook que orquestra tudo, retorna dados + callbacks prontos
- **Model** → tipos, schemas de validação, repository (sem hooks, sem JSX)

## Comunicação entre módulos via eventos

Módulos nunca se importam diretamente.
Publicar em `packages/contracts` → outro módulo assina. Nunca importar módulo B dentro de módulo A.

## Dependency Inversion no domínio

Use cases dependem de interfaces (repositories, providers), nunca de implementações.

```typescript
// ✅ UseCase recebe interface
constructor(private repo: OcorrenciaRepository, private eventBus: EventBus) {}
// ❌ UseCase instancia o ORM diretamente
```

## Checklist de conclusão (stack TS)

- [ ] Barrel export (`index.ts`) atualizado com novos exports
- [ ] Sem imports entre módulos diretos (ESLint boundaries)
- [ ] Typecheck passando: `pnpm turbo typecheck`
- [ ] Testes do pacote/módulo passando
