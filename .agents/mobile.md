# .agents/mobile.md
# Carregar para tarefas mobile (Expo bare workflow)

## MVVM mobile — igual ao web, componentes diferentes

View → React Native components (não HTML)
ViewModel → mesma lógica, TanStack Query + MMKV + estado local
Model → mesmo repository (usa @<escopo>/api-client com interceptor mobile)

## Estado mobile

| Dado | Onde |
|---|---|
| Servidor | TanStack Query (com MMKV persister para offline) |
| Token / sessão | MMKV criptografado — nunca AsyncStorage |
| Tenant ativo | MMKV — injetado via header `X-Tenant-Id` em todo request |
| Dados offline-first | WatermelonDB (só quando usuário edita offline) |
| UI local | useState |

## Desafios — referências rápidas

**Biometria:** `expo-local-authentication` → `authenticateAsync()` antes de usar refresh token salvo
**Push:** `expo-notifications` → registrar token no boot, handler de deep link por `data.type`
**Upload:** `expo-image-picker` + `FileSystem.createUploadTask` com callback de progress
**Offline nível 1:** `networkMode: 'offlineFirst'` no useQuery + MMKV persister já configurado
**Offline nível 2:** WatermelonDB + `synchronize()` ao voltar online via NetInfo listener
**Multi-tenant:** tenant ativo no MMKV → header `X-Tenant-Id` no interceptor do api-client

## Navegação — Expo Router

```typescript
// Proteção de rota no _layout.tsx
const token = tokenStorage.getAccessToken()
const tenant = activeTenantStorage.get()
if (!token) return <Redirect href="/(auth)/login" />
if (!tenant) return <Redirect href="/(auth)/select-org" />
```
