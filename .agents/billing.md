# .agents/billing.md
# Carregar para tarefas de billing (Stripe + PaymentProvider)

## DIP — UseCase nunca conhece Stripe

```typescript
interface PaymentProvider {
  createCheckoutSession(input: CheckoutInput): Promise<{ url: string }>
  handleWebhookEvent(payload: Buffer, sig: string): Promise<DomainEvent[]>
}
// StripePaymentProvider implements PaymentProvider — trocável
```

## Webhook — fonte de verdade do estado da assinatura

```typescript
// rawBody OBRIGATÓRIO para verificação de assinatura
fastify.post('/webhooks/stripe', async (request, reply) => {
  const events = await stripeProvider.handleWebhookEvent(request.body as Buffer, request.headers['stripe-signature'])
  for (const event of events) await eventBus.publish(event)
  return reply.status(200).send({ received: true })
})
```

## Fluxo de pagamento

```
Checkout → PaymentProvider → URL Stripe
Stripe   → POST /webhooks/stripe → verifica assinatura → DomainEvents → eventBus
eventBus → tenancy reage (ativa/suspende) via SubscriptionCanceledEvent de @saas/contracts
```

## Checklist de segurança do webhook

- Verificar assinatura ANTES de processar
- rawBody (buffer), não body parseado
- Retornar 200 imediatamente
- Tratar duplicatas (Stripe pode reenviar)
- Nunca confiar só na resposta do checkout
