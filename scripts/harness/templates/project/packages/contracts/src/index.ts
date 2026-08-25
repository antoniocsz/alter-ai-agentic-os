// Tipos, erros, eventos e EventBus compartilhados entre apps e módulos.
// Nenhum módulo importa outro módulo diretamente — sempre via eventos aqui.

export type TenantId = string

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ListParams {
  page?: number
  pageSize?: number
  search?: string
}

export class DomainError extends Error {}
export class NotFoundError extends DomainError {}
export class ForbiddenError extends DomainError {}

export interface DomainEvent {
  type: string
  occurredAt: Date
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>
}